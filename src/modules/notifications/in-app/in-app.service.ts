import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  InAppNotification,
  InAppNotificationType,
} from '../../../database/entities/in-app-notification.entity';

@Injectable()
export class InAppService {
  constructor(
    @InjectRepository(InAppNotification)
    private repo: Repository<InAppNotification>,
  ) {}

  async create(data: {
    userId:   string;
    title:    string;
    body:     string;
    type:     InAppNotificationType;
    metadata?: Record<string, any>;
  }): Promise<InAppNotification> {
    const notification = this.repo.create({
      userId:   data.userId,
      title:    data.title,
      body:     data.body,
      type:     data.type,
      metadata: data.metadata ?? null,
      isRead:   false,
    });
    return this.repo.save(notification);
  }

  async findForUser(userId: string, page = 1, limit = 20) {
    const take = Math.min(50, Math.max(1, limit));
    const skip = (Math.max(1, page) - 1) * take;

    const [data, total] = await this.repo.findAndCount({
      where:  { userId },
      order:  { createdAt: 'DESC' },
      skip,
      take,
    });

    return { data, meta: { total, page, limit: take, pages: Math.ceil(total / take) } };
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.repo.count({ where: { userId, isRead: false } });
  }

  async markRead(id: string, userId: string): Promise<InAppNotification | null> {
    const notification = await this.repo.findOne({ where: { id, userId } });
    if (!notification || notification.isRead) return notification;

    notification.isRead = true;
    notification.readAt = new Date();
    return this.repo.save(notification);
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.repo
      .createQueryBuilder()
      .update(InAppNotification)
      .set({ isRead: true, readAt: new Date() })
      .where('user_id = :userId AND is_read = false', { userId })
      .execute();

    return { updated: result.affected ?? 0 };
  }
}
