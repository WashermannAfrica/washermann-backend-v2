import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WaitlistSignup } from '../../database/entities/waitlist-signup.entity';
import { WashRepApplication } from '../../database/entities/wash-rep-application.entity';
import { CreateWaitlistDto } from './dto/create-waitlist.dto';
import { CreateWashRepApplicationDto } from './dto/create-wash-rep-application.dto';

@Injectable()
export class MarketingService {
  constructor(
    @InjectRepository(WaitlistSignup)
    private readonly waitlistRepo: Repository<WaitlistSignup>,
    @InjectRepository(WashRepApplication)
    private readonly washRepRepo: Repository<WashRepApplication>,
  ) {}

  // ─── Waitlist ────────────────────────────────────────────────────────────────

  /**
   * Idempotent on email — a repeat signup updates name/segment/source instead of
   * creating a duplicate. Honeypot-filled submissions are silently accepted (so a
   * bot gets a 200) but never persisted.
   */
  async joinWaitlist(dto: CreateWaitlistDto) {
    if (dto.company_website) {
      // Honeypot tripped — pretend success, store nothing.
      return { joined: true };
    }

    const email = dto.email.trim().toLowerCase();
    const existing = await this.waitlistRepo.findOne({ where: { email } });

    if (existing) {
      existing.name = dto.name.trim();
      existing.segment = dto.segment ?? existing.segment;
      existing.source = dto.source ?? existing.source;
      await this.waitlistRepo.save(existing);
      return { joined: true };
    }

    const signup = this.waitlistRepo.create({
      email,
      name: dto.name.trim(),
      segment: dto.segment ?? 'individual',
      source: dto.source ?? 'waitlist',
    });
    await this.waitlistRepo.save(signup);
    return { joined: true };
  }

  async listWaitlist(query: { page?: number; limit?: number }) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(200, Math.max(1, query.limit ?? 50));
    const [data, total] = await this.waitlistRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  // ─── Wash Rep applications ─────────────────────────────────────────────────────

  async applyWashRep(dto: CreateWashRepApplicationDto) {
    if (dto.company_website) {
      return { submitted: true };
    }

    if (typeof dto.workedLogistics !== 'boolean' || typeof dto.workedLaundromat !== 'boolean') {
      throw new BadRequestException('Experience answers are required');
    }

    const application = this.washRepRepo.create({
      fullName: dto.fullName.trim(),
      phone: dto.phone.trim(),
      email: dto.email.trim().toLowerCase(),
      areaOfLagos: dto.areaOfLagos.trim(),
      address: dto.address.trim(),
      workedLogistics: dto.workedLogistics,
      workedLaundromat: dto.workedLaundromat,
      status: 'new',
    });
    await this.washRepRepo.save(application);
    return { submitted: true };
  }

  async listWashRepApplications(query: { page?: number; limit?: number }) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(200, Math.max(1, query.limit ?? 50));
    const [data, total] = await this.washRepRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }
}
