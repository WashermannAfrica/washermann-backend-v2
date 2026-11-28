import {
  BadRequestException,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { RedisService } from '../redis/redis.service';
import { PlacesService } from './places.service';

const RL_PREFIX = 'places:rl:ip:';
const RL_WINDOW_SECONDS = 60;
// Autocomplete fires debounced per keystroke; 60/min/IP comfortably covers real
// typing while capping abuse of this unauthenticated, per-call-billed endpoint.
const RL_MAX = 60;

const MIN_QUERY = 3;

/**
 * Public address lookup backed by Google Places (New). Public because the guest
 * booking funnel needs it before sign-in; protected from bill-running abuse by a
 * per-IP Redis rate limit. Returns the platform's `{ data }` envelope.
 */
@Controller('places')
export class PlacesController {
  constructor(
    private readonly places: PlacesService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get('autocomplete')
  async autocomplete(
    @Req() req: Request,
    @Query('q') q?: string,
    @Query('sessionToken') sessionToken?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ): Promise<{ data: unknown[] }> {
    await this.rateLimit(req);
    const input = (q ?? '').trim();
    if (input.length < MIN_QUERY) return { data: [] };
    const data = await this.places.autocomplete(input, {
      sessionToken: clean(sessionToken),
      bias: toBias(lat, lng),
    });
    return { data };
  }

  @Public()
  @Get('details')
  async details(
    @Req() req: Request,
    @Query('placeId') placeId?: string,
    @Query('sessionToken') sessionToken?: string,
  ): Promise<{ data: unknown }> {
    await this.rateLimit(req);
    const id = (placeId ?? '').trim();
    if (!id) throw new BadRequestException('placeId is required.');
    const data = await this.places.details(id, clean(sessionToken));
    return { data };
  }

  private async rateLimit(req: Request): Promise<void> {
    const key = `${RL_PREFIX}${clientIp(req)}`;
    try {
      const client = this.redis.getClient();
      const n = await client.incr(key);
      if (n === 1) await client.expire(key, RL_WINDOW_SECONDS);
      if (n > RL_MAX) {
        throw new HttpException(
          'Too many address lookups. Please slow down.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } catch (err) {
      // Re-throw the rate-limit rejection; fail open on any Redis outage so a
      // cache blip never blocks real users.
      if (err instanceof HttpException) throw err;
    }
  }
}

function clean(v?: string): string | undefined {
  const t = v?.trim();
  return t ? t : undefined;
}

function toBias(
  lat?: string,
  lng?: string,
): { lat: number; lng: number } | undefined {
  const a = Number(lat);
  const b = Number(lng);
  if (Number.isFinite(a) && Number.isFinite(b) && (a !== 0 || b !== 0)) {
    return { lat: a, lng: b };
  }
  return undefined;
}

/** Real client IP behind proxies (Railway/Vercel set x-forwarded-for). */
function clientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  const first = Array.isArray(fwd) ? fwd[0] : fwd?.split(',')[0];
  return (first ?? req.ip ?? 'unknown').trim();
}
