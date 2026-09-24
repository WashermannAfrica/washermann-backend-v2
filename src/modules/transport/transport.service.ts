import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Vendor } from '../../database/entities/vendor.entity';
import { VendorVerificationStatus } from '../../common/enums/vendor-verification-status.enum';
import { PlatformConfigService } from '../platform-config/platform-config.service';
import { DistanceService, Coord } from './distance.service';

const average = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
/** Nearest-rank percentile (p in 0–100). */
const percentile = (xs: number[], p: number) => {
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
};

/**
 * Distance-based transport pricing (customer ⇄ vendor, round trip). The customer
 * is charged an ESTIMATE at checkout (over the located vendors in their area); the
 * rep is later credited the ACTUAL for the assigned vendor, capped at the estimate.
 */
@Injectable()
export class TransportService {
  constructor(
    private readonly platformConfig: PlatformConfigService,
    private readonly distance: DistanceService,
    @InjectRepository(Vendor) private readonly vendors: Repository<Vendor>,
  ) {}

  private clamp(rawWp: number, minWp: number, maxWp: number): number {
    let v = Math.max(minWp, Math.round(rawWp));
    if (maxWp > 0) v = Math.min(v, maxWp);
    return v;
  }

  private feeFromOneWayKm(
    oneWayKm: number,
    cfg: { transportBaseFareWp: number; transportPerKmWp: number; transportMinWp: number; transportMaxWp: number },
  ): number {
    const roundTripKm = oneWayKm * 2; // customer → vendor and back
    const raw = Number(cfg.transportBaseFareWp) + Number(cfg.transportPerKmWp) * roundTripKm;
    return this.clamp(raw, cfg.transportMinWp, cfg.transportMaxWp);
  }

  /** Checkout estimate: the chosen statistic over distances to the area's located vendors. */
  async estimateForArea(pickup: Coord, areaId: string): Promise<{ transportWp: number; distanceKm: number; vendorCount: number }> {
    const cfg = await this.platformConfig.getConfig();
    const vendors = await this.vendors
      .createQueryBuilder('v')
      .where('v.area_ids @> :area', { area: JSON.stringify([areaId]) })
      .andWhere('v.latitude IS NOT NULL')
      .andWhere('v.longitude IS NOT NULL')
      .andWhere('v.verification_status = :vs', { vs: VendorVerificationStatus.VERIFIED })
      .getMany();

    if (vendors.length === 0) {
      throw new BadRequestException('No located vendors in this area yet — transport cannot be priced');
    }

    const dists: number[] = [];
    for (const v of vendors) {
      dists.push(await this.distance.distanceKm(pickup, { lat: v.latitude!, lng: v.longitude! }, cfg.transportDistanceProvider));
    }
    const km = cfg.transportEstimateBasis === 'p75' ? percentile(dists, 75) : average(dists);
    return { transportWp: this.feeFromOneWayKm(km, cfg), distanceKm: km, vendorCount: vendors.length };
  }

  /** Actual transport for the assigned vendor. */
  async actualForVendor(pickup: Coord, vendor: Coord): Promise<{ transportWp: number; distanceKm: number }> {
    const cfg = await this.platformConfig.getConfig();
    const km = await this.distance.distanceKm(pickup, vendor, cfg.transportDistanceProvider);
    return { transportWp: this.feeFromOneWayKm(km, cfg), distanceKm: km };
  }

  /** What the rep is credited: the actual, capped at what the customer was charged. */
  repTransportWp(actualWp: number, estimateWp: number): number {
    return Math.min(actualWp, estimateWp);
  }
}
