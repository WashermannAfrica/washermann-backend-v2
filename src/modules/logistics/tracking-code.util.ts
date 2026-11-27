import { randomInt } from 'crypto';

/**
 * Human-typeable tracking code alphabet. Crockford-style: no 0/O, 1/I/L or U,
 * so a code read off a screen or dictated over the phone is unambiguous.
 * 30 symbols → 30^6 ≈ 729M codes; collisions are handled by a retry loop at the
 * call site (the `tracking_token` column is unique-indexed in practice).
 */
export const TRACKING_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
export const TRACKING_CODE_LENGTH = 6;

/** Generate one random tracking code (uppercase, unambiguous charset). */
export function makeTrackingCode(
  length: number = TRACKING_CODE_LENGTH,
): string {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    // randomInt is unbiased (rejection sampling) — avoids the modulo bias of
    // Math.random() * alphabet.length.
    code += TRACKING_CODE_ALPHABET[randomInt(TRACKING_CODE_ALPHABET.length)];
  }
  return code;
}

/** True if `value` is shaped like a short tracking code (used for case-insensitive lookup). */
export function isTrackingCodeShaped(value: string): boolean {
  return value.length === TRACKING_CODE_LENGTH && /^[0-9A-Za-z]+$/.test(value);
}
