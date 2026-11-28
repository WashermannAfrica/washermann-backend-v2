import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface PlaceSuggestion {
  placeId: string;
  /** Primary line, e.g. "Ikate". */
  name: string;
  /** Full line, e.g. "Ikate, Lekki, Lagos, Nigeria". */
  placeName: string;
}

export interface PlaceDetail extends PlaceSuggestion {
  latitude: number;
  longitude: number;
}

interface Bias {
  lat: number;
  lng: number;
}

/**
 * Thin wrapper over Google Places API (New) — Autocomplete + Place Details.
 *
 * Runs server-side only, reusing GOOGLE_MAPS_API_KEY (the same key already used
 * for Distance Matrix), so the key is never shipped to the browser. Autocomplete
 * returns predictions without coordinates; Place Details resolves the chosen
 * prediction to a latitude/longitude (the backend requires both on every
 * logistics leg). A session token groups an autocomplete+details pair into one
 * billable session — the caller generates it and passes it to both calls.
 */
@Injectable()
export class PlacesService {
  private readonly logger = new Logger(PlacesService.name);
  private readonly autocompleteUrl =
    'https://places.googleapis.com/v1/places:autocomplete';
  private readonly detailsBase = 'https://places.googleapis.com/v1/places';

  constructor(private readonly config: ConfigService) {}

  private key(): string | null {
    return (
      this.config.get<string>('GOOGLE_MAPS_API_KEY') ??
      process.env.GOOGLE_MAPS_API_KEY ??
      null
    );
  }

  get configured(): boolean {
    return !!this.key();
  }

  async autocomplete(
    input: string,
    opts: { sessionToken?: string; bias?: Bias } = {},
  ): Promise<PlaceSuggestion[]> {
    const q = input.trim();
    if (!q) return [];
    const key = this.requireKey();

    const body: Record<string, unknown> = {
      input: q,
      includedRegionCodes: ['ng'],
      languageCode: 'en',
    };
    if (opts.sessionToken) body.sessionToken = opts.sessionToken;
    if (opts.bias) {
      body.locationBias = {
        circle: {
          center: { latitude: opts.bias.lat, longitude: opts.bias.lng },
          radius: 50000, // 50 km — bias, not a hard restriction
        },
      };
    }

    const res = await this.call(this.autocompleteUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask':
          'suggestions.placePrediction.placeId,' +
          'suggestions.placePrediction.text.text,' +
          'suggestions.placePrediction.structuredFormat.mainText.text,' +
          'suggestions.placePrediction.structuredFormat.secondaryText.text',
      },
      body: JSON.stringify(body),
    });

    const data = (await res.json()) as {
      suggestions?: {
        placePrediction?: {
          placeId?: string;
          text?: { text?: string };
          structuredFormat?: {
            mainText?: { text?: string };
            secondaryText?: { text?: string };
          };
        };
      }[];
    };

    return (data.suggestions ?? [])
      .map((s) => s.placePrediction)
      .filter((p): p is NonNullable<typeof p> => !!p?.placeId)
      .map((p) => {
        const main = p.structuredFormat?.mainText?.text;
        const secondary = p.structuredFormat?.secondaryText?.text;
        const full =
          p.text?.text ?? [main, secondary].filter(Boolean).join(', ');
        return {
          placeId: p.placeId as string,
          name: main ?? full,
          placeName: full,
        };
      });
  }

  async details(placeId: string, sessionToken?: string): Promise<PlaceDetail> {
    const id = placeId.trim();
    if (!id) throw new ServiceUnavailableException('Missing place.');
    const key = this.requireKey();

    const url = new URL(`${this.detailsBase}/${encodeURIComponent(id)}`);
    if (sessionToken) url.searchParams.set('sessionToken', sessionToken);

    const res = await this.call(url.toString(), {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'id,location,formattedAddress,displayName',
      },
    });

    const data = (await res.json()) as {
      id?: string;
      location?: { latitude?: number; longitude?: number };
      formattedAddress?: string;
      displayName?: { text?: string };
    };

    const lat = data.location?.latitude;
    const lng = data.location?.longitude;
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      throw new ServiceUnavailableException(
        'That address has no location. Please pick another.',
      );
    }

    const placeName = data.formattedAddress ?? data.displayName?.text ?? '';
    return {
      placeId: data.id ?? id,
      name: data.displayName?.text ?? placeName,
      placeName,
      latitude: lat,
      longitude: lng,
    };
  }

  private requireKey(): string {
    const key = this.key();
    if (!key) {
      throw new ServiceUnavailableException(
        'Address lookup is not configured.',
      );
    }
    return key;
  }

  private async call(url: string, init: RequestInit): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(8000) });
    } catch (err) {
      this.logger.warn(`Places request failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException(
        'Could not reach the address service. Please try again.',
      );
    }
    if (!res.ok) {
      // 400/403 here almost always means the key is wrong, billing is off, or
      // "Places API (New)" is not enabled — surface a clean message, log detail.
      const text = await res.text().catch(() => '');
      this.logger.warn(`Places API ${res.status}: ${text.slice(0, 300)}`);
      throw new ServiceUnavailableException(
        'Could not look up that address. Please try again.',
      );
    }
    return res;
  }
}
