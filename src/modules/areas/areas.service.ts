import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Area } from '../../database/entities/area.entity';
import { CreateAreaDto } from './dto/create-area.dto';
import { UpdateAreaDto } from './dto/update-area.dto';

@Injectable()
export class AreasService {
  constructor(
    @InjectRepository(Area)
    private areaRepository: Repository<Area>,
  ) {}

  // ─── Create ──────────────────────────────────────────────────────────────────

  async create(dto: CreateAreaDto, adminId: string) {
    // Validate adjacent area IDs reference real areas
    if (dto.adjacentAreaIds?.length) {
      await this.validateAreaIds(dto.adjacentAreaIds);
    }

    const area = this.areaRepository.create({
      name: dto.name.trim(),
      state: dto.state.trim(),
      lga: dto.lga?.trim() ?? null,
      description: dto.description?.trim() ?? null,
      adjacentAreaIds: dto.adjacentAreaIds ?? [],
      transportFeeWP: dto.transportFeeWP,
      isActive: true,
      createdBy: adminId,
    });

    return this.areaRepository.save(area);
  }

  // ─── List ────────────────────────────────────────────────────────────────────

  async findAll(query: {
    page?: number;
    limit?: number;
    search?: string;
    state?: string;
    isActive?: boolean;
  }) {
    const page  = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 50));

    const where: Record<string, unknown>[] = [];

    const base: Record<string, unknown> = {};
    if (query.state)           base.state    = ILike(`%${query.state}%`);
    if (query.isActive != null) base.isActive = query.isActive;

    if (query.search) {
      where.push({ ...base, name: ILike(`%${query.search}%`) });
      where.push({ ...base, lga:  ILike(`%${query.search}%`) });
    } else {
      where.push(base);
    }

    const [areas, total] = await this.areaRepository.findAndCount({
      where,
      order: { state: 'ASC', name: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: areas,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  // ─── Get one ─────────────────────────────────────────────────────────────────

  async findOne(id: string) {
    const area = await this.areaRepository.findOne({ where: { id } });
    if (!area) throw new NotFoundException('Area not found');
    return area;
  }

  // ─── Update ──────────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateAreaDto, adminId: string) {
    const area = await this.findOne(id);

    if (dto.adjacentAreaIds?.length) {
      // Must not include self
      if (dto.adjacentAreaIds.includes(id)) {
        throw new BadRequestException('An area cannot be adjacent to itself');
      }
      await this.validateAreaIds(dto.adjacentAreaIds);
    }

    if (dto.name        != null) area.name           = dto.name.trim();
    if (dto.state       != null) area.state          = dto.state.trim();
    if (dto.lga         != null) area.lga            = dto.lga.trim();
    if (dto.description != null) area.description    = dto.description.trim();
    if (dto.adjacentAreaIds != null) area.adjacentAreaIds = dto.adjacentAreaIds;
    if (dto.transportFeeWP  != null) area.transportFeeWP  = dto.transportFeeWP;
    if (dto.isActive    != null) area.isActive       = dto.isActive;

    return this.areaRepository.save(area);
  }

  // ─── Deactivate ──────────────────────────────────────────────────────────────

  async deactivate(id: string) {
    const area = await this.findOne(id);
    area.isActive = false;
    return this.areaRepository.save(area);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  /** Verify that all provided area IDs exist in the database */
  private async validateAreaIds(ids: string[]) {
    const found = await this.areaRepository
      .createQueryBuilder('a')
      .where('a.id IN (:...ids)', { ids })
      .getCount();
    if (found !== ids.length) {
      throw new BadRequestException('One or more adjacent area IDs are invalid');
    }
  }

  /** Resolve a pickup address to an area (basic: find active area by name match or admin lookup).
   *  In production this would call Google Places API geocoding → polygon lookup.
   *  For now returns by exact area name or null.
   */
  async resolveAreaForAddress(areaName: string): Promise<Area | null> {
    return this.areaRepository.findOne({
      where: { name: ILike(areaName), isActive: true },
    });
  }

  /** Get an area and its transport fee WP — used by the PricingEngine */
  async getTransportFee(areaId: string): Promise<number> {
    const area = await this.findOne(areaId);
    return area.transportFeeWP;
  }
}
