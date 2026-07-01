import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, Repository } from 'typeorm';
import { Area } from '../../database/entities/area.entity';
import { AreaLocation } from '../../database/entities/area-location.entity';
import { Rep } from '../../database/entities/rep.entity';
import { Vendor } from '../../database/entities/vendor.entity';
import { Order } from '../../database/entities/order.entity';
import { CreateAreaDto } from './dto/create-area.dto';
import { UpdateAreaDto } from './dto/update-area.dto';
import { DeactivateAreaDto } from './dto/area-location.dto';

const TERMINAL_ORDER_STATUSES = ['completed', 'cancelled', 'delivered'];

@Injectable()
export class AreasService {
  constructor(
    @InjectRepository(Area) private areaRepository: Repository<Area>,
    @InjectRepository(AreaLocation) private locationRepository: Repository<AreaLocation>,
    @InjectRepository(Rep) private repRepository: Repository<Rep>,
    @InjectRepository(Vendor) private vendorRepository: Repository<Vendor>,
    @InjectRepository(Order) private orderRepository: Repository<Order>,
    private dataSource: DataSource,
  ) {}

  // ─── Create ──────────────────────────────────────────────────────────────────

  async create(dto: CreateAreaDto, adminId: string) {
    if (dto.adjacentAreaIds?.length) {
      await this.validateAreaIds(dto.adjacentAreaIds);
    }

    return this.dataSource.transaction(async (manager) => {
      const area = manager.create(Area, {
        name: dto.name.trim(),
        state: dto.state.trim(),
        lga: dto.lga?.trim() ?? null,
        description: dto.description?.trim() ?? null,
        adjacentAreaIds: dto.adjacentAreaIds ?? [],
        transportFeeWP: dto.transportFeeWP,
        targetUsers: dto.targetUsers ?? 0,
        isActive: true,
        createdBy: adminId,
      });
      await manager.save(area);

      const names = this.cleanLocationNames(dto.locations ?? []);
      if (names.length) {
        await manager.save(
          names.map((name) => manager.create(AreaLocation, { areaId: area.id, name, isActive: true })),
        );
      }
      area.locations = await manager.find(AreaLocation, { where: { areaId: area.id } });
      return area;
    });
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
    if (query.state)            base.state    = ILike(`%${query.state}%`);
    if (query.isActive != null) base.isActive = query.isActive;

    if (query.search) {
      where.push({ ...base, name: ILike(`%${query.search}%`) });
      where.push({ ...base, lga:  ILike(`%${query.search}%`) });
    } else {
      where.push(base);
    }

    const [areas, total] = await this.areaRepository.findAndCount({
      where,
      relations: ['locations'],
      order: { state: 'ASC', name: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Attach per-area rep/vendor counts for the cards.
    const data = await Promise.all(
      areas.map(async (area) => ({
        ...area,
        repsCount: await this.countServing(this.repRepository, 'rep', area.id),
        vendorsCount: await this.countServing(this.vendorRepository, 'vendor', area.id),
      })),
    );

    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  /**
   * Public: active service areas that have at least one active location, each
   * with its locations. Powers the curated area dropdown on the landing forms.
   */
  async publicServiceAreas() {
    const areas = await this.areaRepository.find({
      where: { isActive: true },
      relations: ['locations'],
      order: { state: 'ASC', name: 'ASC' },
    });
    return areas
      .map((a) => ({
        id: a.id,
        name: a.name,
        state: a.state,
        locations: (a.locations ?? [])
          .filter((l) => l.isActive)
          .map((l) => ({ id: l.id, name: l.name })),
      }))
      .filter((a) => a.locations.length > 0);
  }

  // ─── Get one ─────────────────────────────────────────────────────────────────

  async findOne(id: string) {
    const area = await this.areaRepository.findOne({ where: { id } });
    if (!area) throw new NotFoundException('Area not found');
    return area;
  }

  /** Detailed area view for the admin detail page (locations + KPIs + recent orders). */
  async findOneDetailed(id: string) {
    const area = await this.areaRepository.findOne({ where: { id }, relations: ['locations'] });
    if (!area) throw new NotFoundException('Area not found');

    const [repsCount, activeRepsCount, vendorsCount, orderStats, recentOrders] = await Promise.all([
      this.countServing(this.repRepository, 'rep', id),
      this.repRepository
        .createQueryBuilder('rep')
        .where('rep.area_ids @> :a::jsonb', { a: JSON.stringify([id]) })
        .andWhere('rep.status = :active', { active: 'active' })
        .getCount(),
      this.countServing(this.vendorRepository, 'vendor', id),
      this.orderRepository
        .createQueryBuilder('o')
        .select('COUNT(*)', 'total')
        .addSelect(`COUNT(*) FILTER (WHERE o.status NOT IN (:...terminal))`, 'active')
        .addSelect(`COUNT(*) FILTER (WHERE o.status = 'completed')`, 'completed')
        .addSelect('COALESCE(SUM(o.total_wp), 0)', 'revenueWp')
        .addSelect('COALESCE(SUM(o.naira_equivalent_snapshot), 0)', 'revenueNaira')
        .where('o.area_id = :id', { id })
        .setParameter('terminal', TERMINAL_ORDER_STATUSES)
        .getRawOne<{ total: string; active: string; completed: string; revenueWp: string; revenueNaira: string }>(),
      this.orderRepository.find({ where: { areaId: id }, order: { createdAt: 'DESC' }, take: 10 }),
    ]);

    return {
      ...area,
      stats: {
        reps: repsCount,
        activeReps: activeRepsCount,
        vendors: vendorsCount,
        totalOrders: Number(orderStats?.total ?? 0),
        activeOrders: Number(orderStats?.active ?? 0),
        completedOrders: Number(orderStats?.completed ?? 0),
        revenueWP: Number(orderStats?.revenueWp ?? 0),
        revenueNaira: Number(orderStats?.revenueNaira ?? 0),
      },
      recentOrders,
    };
  }

  // ─── Area detail tabs: reps / vendors / orders serving this area ────────────────

  /** Reps serving this area, with their pickup/delivery counts inside it. */
  async areaReps(id: string) {
    await this.findOne(id);
    const reps = await this.repRepository
      .createQueryBuilder('rep')
      .leftJoinAndSelect('rep.user', 'user')
      .where('rep.area_ids @> :a::jsonb', { a: JSON.stringify([id]) })
      .orderBy('rep.rating', 'DESC')
      .getMany();
    const counts = await this.orderRepository
      .createQueryBuilder('o')
      .select('o.rep_id', 'refId')
      .addSelect('COUNT(*)', 'pickups')
      .addSelect(`COUNT(*) FILTER (WHERE o.status IN ('delivered','completed'))`, 'deliveries')
      .where('o.area_id = :id AND o.rep_id IS NOT NULL', { id })
      .groupBy('o.rep_id')
      .getRawMany<{ refId: string; pickups: string; deliveries: string }>();
    const by = new Map(counts.map((c) => [c.refId, c]));
    return reps.map((r) => ({
      id: r.id,
      name: (r as any).user?.fullName ?? '—',
      phone: r.phone,
      rating: Number(r.rating),
      ratingCount: r.ratingCount,
      status: r.status,
      isAvailable: r.isAvailable,
      pickups: Number(by.get(r.id)?.pickups ?? 0),
      deliveries: Number(by.get(r.id)?.deliveries ?? 0),
    }));
  }

  /** Vendors (washermen) serving this area, with their order counts inside it. */
  async areaVendors(id: string) {
    await this.findOne(id);
    const vendors = await this.vendorRepository
      .createQueryBuilder('vendor')
      .leftJoinAndSelect('vendor.user', 'user')
      .where('vendor.area_ids @> :a::jsonb', { a: JSON.stringify([id]) })
      .orderBy('vendor.rating', 'DESC')
      .getMany();
    const counts = await this.orderRepository
      .createQueryBuilder('o')
      .select('o.vendor_id', 'refId')
      .addSelect('COUNT(*)', 'orders')
      .addSelect(`COUNT(*) FILTER (WHERE o.status IN ('delivered','completed'))`, 'delivered')
      .where('o.area_id = :id AND o.vendor_id IS NOT NULL', { id })
      .groupBy('o.vendor_id')
      .getRawMany<{ refId: string; orders: string; delivered: string }>();
    const by = new Map(counts.map((c) => [c.refId, c]));
    return vendors.map((v) => ({
      id: v.id,
      name: v.businessName ?? (v as any).user?.fullName ?? '—',
      phone: v.phone,
      rating: Number(v.rating),
      ratingCount: v.ratingCount,
      status: v.verificationStatus,
      isAvailable: v.isAvailable,
      orders: Number(by.get(v.id)?.orders ?? 0),
      delivered: Number(by.get(v.id)?.delivered ?? 0),
    }));
  }

  /** Paginated orders in this area (with customer name) for the Orders tab. */
  async areaOrders(id: string, page = 1, limit = 20) {
    await this.findOne(id);
    const p = Math.max(1, page);
    const l = Math.min(100, Math.max(1, limit));
    const [rows, total] = await this.orderRepository
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.customer', 'customer')
      .where('o.area_id = :id', { id })
      .orderBy('o.createdAt', 'DESC')
      .skip((p - 1) * l)
      .take(l)
      .getManyAndCount();
    const data = rows.map((o) => ({
      id: o.id,
      reference: o.reference,
      customerName: (o as any).customer?.fullName ?? '—',
      totalWP: o.totalWP,
      status: o.status,
      createdAt: o.createdAt,
    }));
    return { data, meta: { total, page: p, limit: l, pages: Math.ceil(total / l) } };
  }

  // ─── Update ──────────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateAreaDto, adminId: string) {
    const area = await this.findOne(id);

    if (dto.adjacentAreaIds?.length) {
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
    if (dto.targetUsers != null) area.targetUsers     = dto.targetUsers;
    if (dto.isActive    != null) {
      area.isActive = dto.isActive;
      if (dto.isActive) area.deactivationReason = null;
    }

    void adminId;
    return this.areaRepository.save(area);
  }

  // ─── Deactivate ──────────────────────────────────────────────────────────────

  async deactivate(id: string, dto?: DeactivateAreaDto) {
    const area = await this.findOne(id);
    area.isActive = false;
    area.deactivationReason = dto?.reason?.trim() || area.deactivationReason || null;
    return this.areaRepository.save(area);
  }

  // ─── Locations ───────────────────────────────────────────────────────────────

  async listLocations(areaId: string) {
    await this.findOne(areaId);
    return this.locationRepository.find({ where: { areaId }, order: { createdAt: 'ASC' } });
  }

  async addLocation(areaId: string, name: string) {
    await this.findOne(areaId);
    const clean = name.trim();
    if (!clean) throw new BadRequestException('Location name is required');
    return this.locationRepository.save(
      this.locationRepository.create({ areaId, name: clean, isActive: true }),
    );
  }

  async removeLocation(areaId: string, locationId: string) {
    const loc = await this.locationRepository.findOne({ where: { id: locationId, areaId } });
    if (!loc) throw new NotFoundException('Location not found');
    await this.locationRepository.remove(loc);
    return { removed: true };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private cleanLocationNames(names: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of names) {
      const n = (raw ?? '').trim();
      const key = n.toLowerCase();
      if (n && !seen.has(key)) {
        seen.add(key);
        out.push(n);
      }
    }
    return out;
  }

  /** Count reps/vendors whose JSONB area_ids array contains this area. */
  private countServing(
    repo: Repository<Rep> | Repository<Vendor>,
    alias: string,
    areaId: string,
  ): Promise<number> {
    return repo
      .createQueryBuilder(alias)
      .where(`${alias}.area_ids @> :a::jsonb`, { a: JSON.stringify([areaId]) })
      .getCount();
  }

  private async validateAreaIds(ids: string[]) {
    const found = await this.areaRepository
      .createQueryBuilder('a')
      .where('a.id IN (:...ids)', { ids })
      .getCount();
    if (found !== ids.length) {
      throw new BadRequestException('One or more adjacent area IDs are invalid');
    }
  }

  /** Resolve a pickup address to an area (basic exact name match; geocoding TODO). */
  async resolveAreaForAddress(areaName: string): Promise<Area | null> {
    return this.areaRepository.findOne({
      where: { name: ILike(areaName), isActive: true },
    });
  }

  /** Get an area's transport fee WP — used by the PricingEngine. */
  async getTransportFee(areaId: string): Promise<number> {
    const area = await this.findOne(areaId);
    return area.transportFeeWP;
  }
}
