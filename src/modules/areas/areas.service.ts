import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, In, Repository } from 'typeorm';
import { Area } from '../../database/entities/area.entity';
import { AreaLocation } from '../../database/entities/area-location.entity';
import { CoverageGap } from '../../database/entities/coverage-gap.entity';
import { Rep } from '../../database/entities/rep.entity';
import { Vendor } from '../../database/entities/vendor.entity';
import { Order } from '../../database/entities/order.entity';
import { CreateAreaDto } from './dto/create-area.dto';
import { UpdateAreaDto } from './dto/update-area.dto';
import { AddAreaLocationDto, DeactivateAreaDto, UpdateAreaLocationDto } from './dto/area-location.dto';

/** What a lat/lng resolves to: the covering location/area, or the nearest covered fallback. */
export interface CoverageResolution {
  covered: boolean;
  area: Area;
  location: AreaLocation;
  /** Distance in km from the point to the matched/nearest location center. */
  distanceKm: number;
}

const TERMINAL_ORDER_STATUSES = ['completed', 'cancelled', 'delivered'];

@Injectable()
export class AreasService {
  constructor(
    @InjectRepository(Area) private areaRepository: Repository<Area>,
    @InjectRepository(AreaLocation) private locationRepository: Repository<AreaLocation>,
    @InjectRepository(Rep) private repRepository: Repository<Rep>,
    @InjectRepository(Vendor) private vendorRepository: Repository<Vendor>,
    @InjectRepository(Order) private orderRepository: Repository<Order>,
    @InjectRepository(CoverageGap) private coverageGapRepository: Repository<CoverageGap>,
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

      const locs = this.cleanLocationInputs(dto.locations ?? []);
      if (locs.length) {
        await manager.save(
          locs.map((l) =>
            manager.create(AreaLocation, {
              areaId: area.id,
              name: l.name,
              centerLat: l.centerLat ?? null,
              centerLng: l.centerLng ?? null,
              radiusKm: l.radiusKm ?? null,
              isActive: true,
            }),
          ),
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

    // Attach per-area staffing counts (total + "verified" per actor type) for the
    // cards and the admin coverage filter. Computed with a handful of set-based
    // grouped queries rather than a per-area loop (avoids an N+1).
    const [
      vendorsByArea,
      verifiedVendorsByArea,
      repsByArea,
      verifiedRepsByArea,
      verifiedSalesRepsByArea,
    ] = await Promise.all([
      this.countByAreaJsonb('vendors'),
      this.countByAreaJsonb('vendors', "verification_status = 'verified'"),
      this.countByAreaJsonb('reps'),
      this.countByAreaJsonb('reps', "status = 'active'"),
      this.countVerifiedSalesRepsByArea(),
    ]);

    const data = areas.map((area) => ({
      ...area,
      repsCount: repsByArea.get(area.id) ?? 0,
      vendorsCount: vendorsByArea.get(area.id) ?? 0,
      verifiedVendorsCount: verifiedVendorsByArea.get(area.id) ?? 0,
      verifiedRepsCount: verifiedRepsByArea.get(area.id) ?? 0,
      verifiedSalesRepsCount: verifiedSalesRepsByArea.get(area.id) ?? 0,
    }));

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

  /**
   * Best-effort match of a free-text area name to a real Area (case-insensitive,
   * active only). Used to carry a sales-rep applicant's stated area onto their
   * field-rep profile on upgrade. Returns null when nothing matches.
   */
  async findByName(name?: string | null): Promise<Area | null> {
    const q = name?.trim();
    if (!q) return null;
    return this.areaRepository.findOne({ where: { name: ILike(q), isActive: true } });
  }

  /**
   * Assert every id in the list is a real area — used wherever a CLIENT supplies
   * area ids (vendor/rep service areas, legacy order areaId). Converts what would
   * otherwise be a DB foreign-key 500 or a silent no-match into a clean 400.
   */
  async assertAreasExist(ids: string[]): Promise<void> {
    const unique = [...new Set((ids ?? []).filter(Boolean))];
    if (unique.length === 0) return;
    const found = await this.areaRepository.find({ where: { id: In(unique) } });
    if (found.length !== unique.length) {
      const foundIds = new Set(found.map((a) => a.id));
      const missing = unique.filter((id) => !foundIds.has(id));
      throw new BadRequestException(`Unknown area id(s): ${missing.join(', ')}`);
    }
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

  async addLocation(areaId: string, dto: AddAreaLocationDto) {
    await this.findOne(areaId);
    const clean = dto.name.trim();
    if (!clean) throw new BadRequestException('Location name is required');
    return this.locationRepository.save(
      this.locationRepository.create({
        areaId,
        name: clean,
        centerLat: dto.centerLat ?? null,
        centerLng: dto.centerLng ?? null,
        radiusKm: dto.radiusKm ?? null,
        isActive: true,
      }),
    );
  }

  async updateLocation(areaId: string, locationId: string, dto: UpdateAreaLocationDto) {
    const loc = await this.locationRepository.findOne({ where: { id: locationId, areaId } });
    if (!loc) throw new NotFoundException('Location not found');
    if (dto.name      != null) loc.name      = dto.name.trim();
    if (dto.centerLat != null) loc.centerLat = dto.centerLat;
    if (dto.centerLng != null) loc.centerLng = dto.centerLng;
    if (dto.radiusKm  != null) loc.radiusKm  = dto.radiusKm;
    return this.locationRepository.save(loc);
  }

  async removeLocation(areaId: string, locationId: string) {
    const loc = await this.locationRepository.findOne({ where: { id: locationId, areaId } });
    if (!loc) throw new NotFoundException('Location not found');
    await this.locationRepository.remove(loc);
    return { removed: true };
  }

  /** Admin: uncovered-address demand signals, newest first (where to open next). */
  async listCoverageGaps(page = 1, limit = 50) {
    const p = Math.max(1, page);
    const l = Math.min(200, Math.max(1, limit));
    const [rows, total] = await this.coverageGapRepository.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (p - 1) * l,
      take: l,
    });
    // Attach the fallback area's name for readability.
    const areaIds = [...new Set(rows.map((r) => r.fallbackAreaId).filter((x): x is string => !!x))];
    const areas = areaIds.length ? await this.areaRepository.find({ where: { id: In(areaIds) } }) : [];
    const byId = new Map(areas.map((a) => [a.id, a.name]));
    const data = rows.map((r) => ({ ...r, fallbackAreaName: r.fallbackAreaId ? (byId.get(r.fallbackAreaId) ?? null) : null }));
    return { data, meta: { total, page: p, limit: l, pages: Math.ceil(total / l) } };
  }

  // ─── Geofence resolution ──────────────────────────────────────────────────────

  /** Great-circle distance in km between two points (haversine). */
  private haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  /**
   * Resolve a point to coverage. An area's region is the UNION of its locations'
   * circles, so the check is point-in-any-circle:
   *  - inside one or more circles → covered=true, nearest center wins the tie-break;
   *  - outside all circles → covered=false, FALLBACK to the nearest geofenced
   *    location's area (per product rule: never reject — route to the closest
   *    covered area) and log a coverage gap as a demand signal;
   *  - no geofenced locations exist at all → null (caller keeps legacy behavior).
   */
  async resolveAreaForPoint(
    lat: number,
    lng: number,
    opts: { userId?: string; addressText?: string; source?: 'resolve_check' | 'order_placed'; logGap?: boolean } = {},
  ): Promise<CoverageResolution | null> {
    const locations = await this.locationRepository
      .createQueryBuilder('loc')
      .innerJoinAndSelect('loc.area', 'area')
      .where('loc.is_active = true')
      .andWhere('area.is_active = true')
      .andWhere('loc.center_lat IS NOT NULL')
      .andWhere('loc.center_lng IS NOT NULL')
      .andWhere('loc.radius_km IS NOT NULL')
      .getMany();

    if (locations.length === 0) return null;

    let nearest: { loc: AreaLocation; distanceKm: number } | null = null;
    let nearestCovered: { loc: AreaLocation; distanceKm: number } | null = null;

    for (const loc of locations) {
      const d = this.haversineKm(lat, lng, loc.centerLat!, loc.centerLng!);
      if (!nearest || d < nearest.distanceKm) nearest = { loc, distanceKm: d };
      if (d <= loc.radiusKm! && (!nearestCovered || d < nearestCovered.distanceKm)) {
        nearestCovered = { loc, distanceKm: d };
      }
    }

    const hit = nearestCovered ?? nearest!;
    const covered = !!nearestCovered;

    if (!covered && opts.logGap !== false) {
      // Fire-and-forget demand signal — never block resolution on logging.
      void this.coverageGapRepository
        .save(
          this.coverageGapRepository.create({
            userId: opts.userId ?? null,
            latitude: lat,
            longitude: lng,
            addressText: opts.addressText ?? null,
            fallbackAreaId: hit.loc.areaId,
            distanceKm: Math.round(hit.distanceKm * 100) / 100,
            source: opts.source ?? 'resolve_check',
          }),
        )
        .catch(() => undefined);
    }

    return {
      covered,
      area: hit.loc.area!,
      location: hit.loc,
      distanceKm: Math.round(hit.distanceKm * 100) / 100,
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  /** Trim + dedupe location inputs by name (case-insensitive), keeping geometry. */
  private cleanLocationInputs(inputs: AddAreaLocationDto[]): AddAreaLocationDto[] {
    const seen = new Set<string>();
    const out: AddAreaLocationDto[] = [];
    for (const raw of inputs) {
      const n = (raw?.name ?? '').trim();
      const key = n.toLowerCase();
      if (n && !seen.has(key)) {
        seen.add(key);
        out.push({ ...raw, name: n });
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

  /**
   * Count, per area, the rows in `vendors`/`reps` whose JSONB `area_ids` contains
   * that area — optionally constrained by a status predicate. Returns a Map of
   * areaId → count. `table` is a fixed internal literal and `predicate` is a
   * hard-coded constant (never user input), so this is not injectable.
   */
  private async countByAreaJsonb(
    table: 'vendors' | 'reps',
    predicate?: string,
  ): Promise<Map<string, number>> {
    const rows: Array<{ area_id: string; count: string }> = await this.dataSource.query(
      `SELECT elem AS area_id, COUNT(*)::int AS count
         FROM ${table} t, jsonb_array_elements_text(t.area_ids) AS elem
        ${predicate ? `WHERE ${predicate}` : ''}
        GROUP BY elem`,
    );
    return new Map(rows.map((r) => [r.area_id, Number(r.count)]));
  }

  /**
   * Count verified sales reps per area. Sales reps aren't area-scoped by id — they
   * store the *town* they registered under (`sales_rep_applications.area_of_lagos`),
   * which is chosen from the admin-curated location list. We map that town name
   * back to its area via `area_locations.name → area_id` (case-insensitive).
   * "Verified" = the onboarding assessment was passed. Returns areaId → count.
   */
  private async countVerifiedSalesRepsByArea(): Promise<Map<string, number>> {
    const rows: Array<{ area_id: string; count: string }> = await this.dataSource.query(
      `SELECT al.area_id AS area_id, COUNT(DISTINCT sr.id)::int AS count
         FROM sales_reps sr
         JOIN sales_rep_applications sra ON sra.id = sr.application_id
         JOIN area_locations al ON LOWER(al.name) = LOWER(sra.area_of_lagos)
        WHERE sr.assessment_passed = true
        GROUP BY al.area_id`,
    );
    return new Map(rows.map((r) => [r.area_id, Number(r.count)]));
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
