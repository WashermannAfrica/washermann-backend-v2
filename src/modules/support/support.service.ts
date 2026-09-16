import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { SupportConversation } from '../../database/entities/support-conversation.entity';
import { SupportMessage } from '../../database/entities/support-message.entity';
import { User } from '../../database/entities/user.entity';
import { Role } from '../../common/enums/roles.enum';
import { primaryActorType } from '../audit/audit-describe';
import { SupportGateway } from './support.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { SendSupportMessageDto } from './dto/support.dto';

const AGENT_ROLES = [Role.ADMIN, Role.DISPUTE_RESOLVER, Role.FINANCE];

@Injectable()
export class SupportService {
  constructor(
    @InjectRepository(SupportConversation) private convRepo: Repository<SupportConversation>,
    @InjectRepository(SupportMessage) private msgRepo: Repository<SupportMessage>,
    @InjectRepository(User) private userRepo: Repository<User>,
    private gateway: SupportGateway,
    private notifications: NotificationsService,
  ) {}

  // ─── User side ──────────────────────────────────────────────────────────────

  /** Open (or create) my support thread + latest messages. Marks agent msgs read. */
  async getMyConversation(userId: string, roles: string[]) {
    const conv = await this.getOrCreate(userId, roles);
    const messages = await this.msgRepo.find({
      where: { conversationId: conv.id },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    if (conv.unreadForUser > 0) {
      conv.unreadForUser = 0;
      await this.convRepo.save(conv);
    }
    return { data: { conversation: conv, messages: messages.reverse() } };
  }

  async getMyMessages(userId: string, before?: string, limit = 30) {
    const conv = await this.convRepo.findOne({ where: { userId } });
    if (!conv) return { data: [], meta: { hasMore: false } };
    const take = Math.min(50, Math.max(1, limit));
    const messages = await this.msgRepo.find({
      where: { conversationId: conv.id, ...(before ? { createdAt: LessThan(new Date(before)) } : {}) },
      order: { createdAt: 'DESC' },
      take: take + 1,
    });
    const hasMore = messages.length > take;
    return { data: messages.slice(0, take).reverse(), meta: { hasMore } };
  }

  async sendAsUser(userId: string, roles: string[], dto: SendSupportMessageDto) {
    const conv = await this.getOrCreate(userId, roles);
    const user = await this.userRepo.findOne({ where: { id: userId }, select: ['id', 'fullName'] });
    const message = await this.persist(conv, {
      senderId: userId,
      senderType: 'user',
      senderName: user?.fullName ?? null,
      body: dto.body,
      attachments: dto.attachments,
    });
    conv.unreadForAgent += 1;
    conv.status = conv.status === 'closed' ? 'open' : conv.status;
    await this.touch(conv, message);

    this.gateway.emitMessage(conv, message);
    this.gateway.emitConversationUpdated(conv);
    this.notifications.notifySupportNewUserMessage({ conversationId: conv.id, fromName: user?.fullName ?? 'A user', preview: message.body });
    return { data: message };
  }

  async markReadByUser(userId: string) {
    const conv = await this.convRepo.findOne({ where: { userId } });
    if (conv && conv.unreadForUser > 0) {
      conv.unreadForUser = 0;
      await this.convRepo.save(conv);
    }
    return { data: null };
  }

  // ─── Agent side ─────────────────────────────────────────────────────────────

  async agentList(query: { status?: string; search?: string; page?: number; limit?: number }) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 25));
    const qb = this.convRepo
      .createQueryBuilder('c')
      .leftJoin(User, 'u', 'u.id = c.user_id')
      .addSelect(['u.full_name AS u_full_name', 'u.email AS u_email'])
      .orderBy('c.lastMessageAt', 'DESC', 'NULLS LAST')
      .skip((page - 1) * limit)
      .take(limit);
    if (query.status) qb.andWhere('c.status = :st', { st: query.status });
    if (query.search) qb.andWhere('(u.full_name ILIKE :q OR u.email ILIKE :q)', { q: `%${query.search}%` });

    const { entities, raw } = await qb.getRawAndEntities();
    const total = await qb.getCount();
    const data = entities.map((c, i) => ({
      ...c,
      user: { fullName: raw[i]?.u_full_name ?? null, email: raw[i]?.u_email ?? null },
    }));
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async agentGet(conversationId: string) {
    const conv = await this.convRepo.findOne({ where: { id: conversationId } });
    if (!conv) throw new NotFoundException('Conversation not found');
    const [user, messages] = await Promise.all([
      this.userRepo.findOne({ where: { id: conv.userId }, select: ['id', 'fullName', 'email', 'phone'] }),
      this.msgRepo.find({ where: { conversationId }, order: { createdAt: 'ASC' } }),
    ]);
    if (conv.unreadForAgent > 0) {
      conv.unreadForAgent = 0;
      await this.convRepo.save(conv);
    }
    return { data: { conversation: { ...conv, user }, messages } };
  }

  async agentSend(conversationId: string, agentId: string, dto: SendSupportMessageDto) {
    const conv = await this.convRepo.findOne({ where: { id: conversationId } });
    if (!conv) throw new NotFoundException('Conversation not found');
    const agent = await this.userRepo.findOne({ where: { id: agentId }, select: ['id', 'fullName'] });
    const message = await this.persist(conv, {
      senderId: agentId,
      senderType: 'agent',
      senderName: agent?.fullName ?? 'Support',
      body: dto.body,
      attachments: dto.attachments,
    });
    conv.unreadForUser += 1;
    conv.status = 'open';
    if (!conv.assignedAgentId) conv.assignedAgentId = agentId;
    await this.touch(conv, message);

    this.gateway.emitMessage(conv, message);
    this.gateway.emitConversationUpdated(conv);
    this.notifications.notifySupportAgentReply({ userId: conv.userId, preview: message.body });
    return { data: message };
  }

  async agentUpdate(conversationId: string, agentId: string, dto: { status?: 'open' | 'pending' | 'closed'; assignToMe?: boolean }) {
    const conv = await this.convRepo.findOne({ where: { id: conversationId } });
    if (!conv) throw new NotFoundException('Conversation not found');
    if (dto.status) conv.status = dto.status;
    if (dto.assignToMe) conv.assignedAgentId = agentId;
    await this.convRepo.save(conv);
    this.gateway.emitConversationUpdated(conv);
    return { data: conv };
  }

  // ─── Access guard for the REST detail routes ──────────────────────────────────

  assertAgent(roles: Role[]) {
    if (!roles.some((r) => AGENT_ROLES.includes(r))) {
      throw new ForbiddenException('Support agents only');
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private async getOrCreate(userId: string, roles: string[]): Promise<SupportConversation> {
    let conv = await this.convRepo.findOne({ where: { userId } });
    if (conv) return conv;
    conv = await this.convRepo.save(
      this.convRepo.create({
        userId,
        userRole: primaryActorType(roles),
        status: 'open',
        unreadForUser: 0,
        unreadForAgent: 0,
      }),
    );
    // Seed the welcome message shown on the Live Chat screen.
    const user = await this.userRepo.findOne({ where: { id: userId }, select: ['id', 'fullName'] });
    const first = (user?.fullName ?? 'there').split(' ')[0];
    await this.persist(conv, {
      senderId: null,
      senderType: 'system',
      senderName: 'Washermann Support',
      body: `Hi ${first}, welcome to Washermann support. How can we help you today?`,
      attachments: undefined,
    });
    return conv;
  }

  private persist(
    conv: SupportConversation,
    m: { senderId: string | null; senderType: 'user' | 'agent' | 'system'; senderName: string | null; body: string; attachments?: string[] },
  ): Promise<SupportMessage> {
    return this.msgRepo.save(
      this.msgRepo.create({
        conversationId: conv.id,
        senderId: m.senderId,
        senderType: m.senderType,
        senderName: m.senderName,
        body: m.body.trim(),
        attachments: m.attachments?.length ? m.attachments : null,
      }),
    );
  }

  private async touch(conv: SupportConversation, message: SupportMessage) {
    conv.lastMessageAt = message.createdAt ?? new Date();
    conv.lastMessagePreview = message.body.slice(0, 300);
    await this.convRepo.save(conv);
  }
}
