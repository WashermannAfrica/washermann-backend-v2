/**
 * Canonicalise a phone number so the same person maps to ONE stored value.
 * Strips separators, then normalises Nigerian mobiles to +234 E.164 — mirroring
 * the web/portal clients (their phone.ts) — so 0803…, 234803… and +234803… all
 * become +234803…. A non-Nigerian number falls back to the stripped form.
 *
 * This is what lets a guest (who booked with a phone) and a later vendor signup
 * with the same phone resolve to the same user row.
 */
export function canonicalizePhone(raw: string): string {
  const stripped = (raw ?? '').replace(/[\s()-]/g, '').trim();
  const m = stripped.match(/^(?:\+?234|0)([789][01]\d{8})$/);
  return m ? `+234${m[1]}` : stripped;
}
