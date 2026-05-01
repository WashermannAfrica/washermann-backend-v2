import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Rep } from '../../database/entities/rep.entity';
import { RepPseudoWallet } from '../../database/entities/rep-pseudo-wallet.entity';
import { RepPseudoLedgerEntry } from '../../database/entities/rep-pseudo-ledger-entry.entity';
import { User } from '../../database/entities/user.entity';
import { CreateRepDto } from './dto/create-rep.dto';
import { UpdateRepDto } from './dto/update-rep.dto';
import { RepStatus } from '../../common/enums/rep-status.enum';
import { Role } from '../../common/enums/roles.enum';
import { LedgerSource } from '../../common/enums/ledger-source.enum';

@Injectable()
export class RepsService {
  constructor(
    @InjectRepository(Rep)
    private repRepository: Repository<Rep>,

    @InjectRepository(RepPseudoWallet)
    private walletRepository: Repository<RepPseudoWallet>,

    @InjectRepository(RepPseudoLedgerEntry)
    private ledgerRepository: Repository<RepPseudoLedgerEntry>,

    @InjectRepository(User)
    private userRepository: Repository<User>,

    private dataSource: DataSource,
  ) {}

  // ─── Create rep (admin only) ──────────────────────────────────────────────────

  async create(dto: CreateRepDto, adminId: string) {
    const existing = await this.userRepository.findOne({
      where: [{ email: dto.email.toLowerCase() }, { phone: dto.phone }],
    });
    if (existing) {
      throw new ConflictException('A user with this email or phone already exists');
    }

    return this.dataSource.transaction(async (manager) => {
      // Create user account with temp password
      const tempPassword = Math.random().toString(36).slice(-10);
      const passwordHash = await bcrypt.hash(tempPassword, 12);

      const user = manager.create(User, {
        fullName: dto.fullName.trim(),
        email: dto.email.toLowerCase().trim(),
        phone: dto.phone.trim(),
        passwordHash,
        roles: [Role.REP],
        emailVerified: false,
      });
      await manager.save(user);

      // Create rep record
      const rep = manager.create(Rep, {
        userId: user.id,
        areaIds: dto.areaIds ?? [],
        phone: dto.phone.trim(),
        contractUrl: dto.contractUrl ?? null,
        status: RepStatus.ACTIVE,
        isAvailable: false,
        assignmentPriority: dto.assignmentPriority ?? 100,
        rating: 0,
        ratingCount: 0,
        flaggedForReview: false,
        notes: dto.notes ?? null,
      });
      await manager.save(rep);

      // Create pseudo-wallet
      const wallet = manager.create(RepPseudoWallet, {
        repId: rep.id,
        balance: 0,
        totalEarned: 0,
        cycleStartedAt: new Date(),
      });
      await manager.save(wallet);

      return { rep, user: this.sanitizeUser(user) };
    });
  }

  // ─── List reps (admin) ────────────────────────────────────────────────────────

  async findAll(query: {
    page?: number;
    limit?: number;
    search?: string;
    status?: RepStatus;
    isAvailable?: boolean;
    flaggedForReview?: boolean;
  }) {
    const page  = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));

    const qb = this.repRepository
      .createQueryBuilder('r')
      .leftJoin('r.user', 'u')
      .addSelect(['u.id', 'u.fullName', 'u.email', 'u.phone'])
      .orderBy('r.assignmentPriority', 'ASC')
      .addOrderBy('r.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.status)           qb.andWhere('r.status = :status', { status: query.status });
    if (query.isAvailable != null) qb.andWhere('r.isAvailable = :avail', { avail: query.isAvailable });
    if (query.flaggedForReview != null) qb.andWhere('r.flaggedForReview = :flag', { flag: query.flaggedForReview });
    if (query.search) {
      qb.andWhere(
        '(u.fullName ILIKE :q OR u.email ILIKE :q OR r.phone ILIKE :q)',
        { q: `%${query.search}%` },
      );
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  // ─── Get one ──────────────────────────────────────────────────────────────────

  async findOne(id: string) {
    const rep = await this.repRepository
      .createQueryBuilder('r')
      .leftJoin('r.user', 'u')
      .addSelect(['u.id', 'u.fullName', 'u.email', 'u.phone'])
      .where('r.id = :id', { id })
      .getOne();
    if (!rep) throw new NotFoundException('Rep not found');
    return rep;
  }

  async findByUserId(userId: string) {
    const rep = await this.repRepository.findOne({ where: { userId } });
    if (!rep) throw new NotFoundException('Rep profile not found');
    return rep;
  }

  // ─── Update ───────────────────────────────────────────────────────────────────

  async update(repId: string, dto: UpdateRepDto) {
    const rep = await this.repRepository.findOne({ where: { id: repId } });
    if (!rep) throw new NotFoundException('Rep not found');

    if (dto.areaIds           != null) rep.areaIds           = dto.areaIds;
    if (dto.phone             != null) rep.phone             = dto.phone.trim();
    if (dto.contractUrl       != null) rep.contractUrl       = dto.contractUrl;
    if (dto.status            != null) {
      rep.status = dto.status;
      if (dto.status !== RepStatus.ACTIVE) rep.isAvailable = false;
    }
    if (dto.assignmentPriority != null) rep.assignmentPriority = dto.assignmentPriority;
    if (dto.notes             != null) rep.notes             = dto.notes;

    return this.repRepository.save(rep);
  }

  // ─── Rep self-manages availability ───────────────────────────────────────────

  async setAvailability(repId: string, isAvailable: boolean) {
    const rep = await this.repRepository.findOne({ where: { id: repId } });
    if (!rep) throw new NotFoundException('Rep not found');
    if (rep.status !== RepStatus.ACTIVE) {
      throw new ForbiddenException('Only active reps can toggle availability');
    }
    rep.isAvailable = isAvailable;
    return this.repRepository.save(rep);
  }

  // ─── Admin: clear flag ────────────────────────────────────────────────────────

  async clearFlag(repId: string) {
    const rep = await this.repRepository.findOne({ where: { id: repId } });
    if (!rep) throw new NotFoundException('Rep not found');
    rep.flaggedForReview = false;
    rep.flaggedAt        = null;
    return this.repRepository.save(rep);
  }

  // ─── Pseudo-wallet (admin view only) ─────────────────────────────────────────

  async getWallet(repId: string) {
    const wallet = await this.walletRepository.findOne({ where: { repId } });
    if (!wallet) throw new NotFoundException('Rep pseudo-wallet not found');
    return wallet;
  }

  async getLedger(repId: string, page = 1, limit = 20) {
    const [entries, total] = await this.ledgerRepository.findAndCount({
      where: { repId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data: entries, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  /**
   * Credit the rep pseudo-wallet (called on order completion).
   */
  async creditWallet(
    repId: string,
    amount: number,
    source: LedgerSource,
    description: string,
    meta?: { orderId?: string; reference?: string },
  ) {
    const wallet = await this.walletRepository.findOne({ where: { repId } });
    if (!wallet) throw new NotFoundException('Rep pseudo-wallet not found');

    const balanceBefore = wallet.balance;
    wallet.balance    += amount;
    wallet.totalEarned += amount;
    await this.walletRepository.save(wallet);

    const entry = this.ledgerRepository.create({
      walletId: wallet.id,
      repId,
      type: 'credit',
      amount,
      balanceBefore,
      balanceAfter: wallet.balance,
      source,
      orderId: meta?.orderId ?? null,
      reference: meta?.reference ?? null,
      description,
      metadata: null,
    });
    await this.ledgerRepository.save(entry);

    return wallet;
  }

  /**
   * Reset the pseudo-wallet balance for a new bonus cycle.
   * Called by the bonus calculation job at cycle start.
   */
  async resetCycleBalance(repId: string) {
    const wallet = await this.walletRepository.findOne({ where: { repId } });
    if (!wallet) throw new NotFoundException('Rep pseudo-wallet not found');

    wallet.balance        = 0;
    wallet.cycleStartedAt = new Date();
    return this.walletRepository.save(wallet);
  }

  /**
   * Calculate bonus for a rep given their average rating and cycle earnings.
   * Used by the bonus cycle job — does NOT credit the wallet; caller does that.
   */
  async calculateBonus(
    cycleWP: number,
    averageRating: number,
    bonusTiers: Array<{ minRating: number; maxRating: number; bonusPercent: number }>,
  ): Promise<number> {
    const tier = bonusTiers.find(
      (t) => averageRating >= t.minRating && averageRating <= t.maxRating,
    );
    if (!tier || tier.bonusPercent === 0) return 0;
    return Math.floor(cycleWP * (tier.bonusPercent / 100));
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private sanitizeUser(user: User) {
    const { passwordHash, ...safe } = user as any;
    return safe;
  }
}
