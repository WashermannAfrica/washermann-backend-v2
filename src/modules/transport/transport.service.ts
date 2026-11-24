import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Vendor } from '../../database/entities/vendor.entity';
import { ConversionRate } from '../../database/entities/conversion-rate.entity';
import { VendorVerificationStatus } from '../../common/enums/vendor-verification-status.enum';
import { PlatformConfigService } from '../platform-config/platform-config.service';
import { DistanceService, Coord } from './distance.service';

const average = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
/** Nearest-rank percentile (p in 0–100). */
const percentile = (xs: number[], p: number) => {
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx];
};

/**
 * Distance-based transport pricing (customer ⇄ vendor, round trip). The fare is
 * authored and computed in NAIRA (₦) — the platform's real economic unit — then
 * converted to WashPoints at the live rate for the WP-denominated ledger. The
 * customer is charged an ESTIMATE at checkout (over the located vendors in their
 * area); the rep is later credited the ACTUAL for the assigned vendor, capped at
 * the estimate. Every public result carries both the ₦ figure and its WP equivalent.
 */
@Injectable()
export class TransportService {
  constructor(
    private readonly platformConfig: PlatformConfigService,
    private readonly distance: DistanceService,
    @InjectRepository(Vendor) private readonly vendors: Repository<Vendor>,
    @InjectRepository(ConversionRate)
    private readonly rates: Repository<ConversionRate>,
  ) {}

  /** Current active WashPoints-per-₦1 rate (same source the quote engine uses). */
  private async pointsPerNaira(): Promise<number> {
    const rate = await this.rates
      .createQueryBuilder('r')
      .where('r.currency = :c', { c: 'NGN' })
      .andWhere('r.effectiveFrom <= NOW()')
      .orderBy('r.effectiveFrom', 'DESC')
      .getOne();
    const ppu = rate ? Number(rate.pointsPerUnit) : 1;
    return ppu > 0 ? ppu : 1;
  }

  private ngnToWp(ngn: number, pointsPerNaira: number): number {
    return Math.round(ngn * pointsPerNaira);
  }

  private clampNgn(rawNgn: number, minNgn: number, maxNgn: number): number {
    let v = Math.max(minNgn, Math.round(rawNgn));
    if (maxNgn > 0) v = Math.min(v, maxNgn);
    return v;
  }

  /** Round-trip transport fare in ₦ for a wash order (customer → vendor and back). */
  private feeNgnFromOneWayKm(
    oneWayKm: number,
    cfg: {
      transportBaseFareNgn: number;
      transportPerKmNgn: number;
      transportMinNgn: number;
      transportMaxNgn: number;
    },
  ): number {
    const roundTripKm = oneWayKm * 2; // customer → vendor and back
    const raw =
      Number(cfg.transportBaseFareNgn) +
      Number(cfg.transportPerKmNgn) * roundTripKm;
    return this.clampNgn(raw, cfg.transportMinNgn, cfg.transportMaxNgn);
  }

  /** Checkout estimate: the chosen statistic over distances to the area's located vendors. */
  async estimateForArea(
    pickup: Coord,
    areaId: string,
  ): Promise<{
    transportWp: number;
    transportNgn: number;
    distanceKm: number;
    vendorCount: number;
  }> {
    const [cfg, ppu] = await Promise.all([
      this.platformConfig.getConfig(),
      this.pointsPerNaira(),
    ]);
    const vendors = await this.vendors
      .createQueryBuilder('v')
      .where('v.area_ids @> :area', { area: JSON.stringify([areaId]) })
      .andWhere('v.latitude IS NOT NULL')
      .andWhere('v.longitude IS NOT NULL')
      .andWhere('v.verification_status = :vs', {
        vs: VendorVerificationStatus.VERIFIED,
      })
      .getMany();

    if (vendors.length === 0) {
      throw new BadRequestException(
        'No located vendors in this area yet — transport cannot be priced',
      );
    }

    const dists: number[] = [];
    for (const v of vendors) {
      dists.push(
        await this.distance.distanceKm(
          pickup,
          { lat: v.latitude!, lng: v.longitude! },
          cfg.transportDistanceProvider,
        ),
      );
    }
    const km =
      cfg.transportEstimateBasis === 'p75'
        ? percentile(dists, 75)
        : average(dists);
    const transportNgn = this.feeNgnFromOneWayKm(km, cfg);
    return {
      transportWp: this.ngnToWp(transportNgn, ppu),
      transportNgn,
      distanceKm: km,
      vendorCount: vendors.length,
    };
  }

  /** Actual transport for the assigned vendor. */
  async actualForVendor(
    pickup: Coord,
    vendor: Coord,
  ): Promise<{ transportWp: number; transportNgn: number; distanceKm: number }> {
    const [cfg, ppu] = await Promise.all([
      this.platformConfig.getConfig(),
      this.pointsPerNaira(),
    ]);
    const km = await this.distance.distanceKm(
      pickup,
      vendor,
      cfg.transportDistanceProvider,
    );
    const transportNgn = this.feeNgnFromOneWayKm(km, cfg);
    return {
      transportWp: this.ngnToWp(transportNgn, ppu),
      transportNgn,
      distanceKm: km,
    };
  }

  /** What the rep is credited: the actual, capped at what the customer was charged. */
  repTransportWp(actualWp: number, estimateWp: number): number {
    return Math.min(actualWp, estimateWp);
  }

  /**
   * One-way transport fee for a single logistics leg (A→B), in ₦ and WP.
   * Unlike a wash order (round trip), a leg is a single directional trip.
   */
  async legFee(
    a: Coord,
    b: Coord,
  ): Promise<{ transportWp: number; transportNgn: number; distanceKm: number }> {
    const [cfg, ppu] = await Promise.all([
      this.platformConfig.getConfig(),
      this.pointsPerNaira(),
    ]);
    const km = await this.distance.distanceKm(
      a,
      b,
      cfg.transportDistanceProvider,
    );
    const raw =
      Number(cfg.transportBaseFareNgn) + Number(cfg.transportPerKmNgn) * km;
    const transportNgn = this.clampNgn(
      raw,
      cfg.transportMinNgn,
      cfg.transportMaxNgn,
    );
    return {
      transportWp: this.ngnToWp(transportNgn, ppu),
      transportNgn,
      distanceKm: km,
    };
  }
}
