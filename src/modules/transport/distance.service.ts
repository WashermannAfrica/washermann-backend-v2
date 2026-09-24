import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface Coord {
  lat: number;
  lng: number;
}

export type DistanceProvider = 'haversine' | 'google';

const toRad = (d: number) => (d * Math.PI) / 180;

@Injectable()
export class DistanceService {
  private readonly logger = new Logger(DistanceService.name);

  constructor(private readonly config: ConfigService) {}

  /** Great-circle (straight-line) distance in km. Free, instant, ~under road distance. */
  haversineKm(a: Coord, b: Coord): number {
    const R = 6371; // km
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  /**
   * One-way distance in km using the selected provider. Google (road distance) falls
   * back to Haversine when the key is missing or the call fails, so pricing never breaks.
   */
  async distanceKm(a: Coord, b: Coord, provider: DistanceProvider): Promise<number> {
    if (provider === 'google') {
      const road = await this.googleRoadKm(a, b);
      if (road != null) return road;
    }
    return this.haversineKm(a, b);
  }

  private async googleRoadKm(a: Coord, b: Coord): Promise<number | null> {
    const key = this.config.get<string>('GOOGLE_MAPS_API_KEY') ?? process.env.GOOGLE_MAPS_API_KEY;
    if (!key) return null;
    try {
      const url =
        'https://maps.googleapis.com/maps/api/distancematrix/json' +
        `?origins=${a.lat},${a.lng}&destinations=${b.lat},${b.lng}&mode=driving&key=${key}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const json = (await res.json()) as {
        rows?: { elements?: { status?: string; distance?: { value?: number } }[] }[];
      };
      const el = json?.rows?.[0]?.elements?.[0];
      if (el?.status !== 'OK' || el?.distance?.value == null) return null;
      return el.distance.value / 1000; // metres → km
    } catch (err) {
      this.logger.warn(`Google distance failed, falling back to haversine: ${(err as Error).message}`);
      return null;
    }
  }
}
