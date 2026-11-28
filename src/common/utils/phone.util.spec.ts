import { canonicalizePhone } from './phone.util';

describe('canonicalizePhone', () => {
  it('normalises every Nigerian format to +234 E.164', () => {
    expect(canonicalizePhone('08031234567')).toBe('+2348031234567');
    expect(canonicalizePhone('2348031234567')).toBe('+2348031234567');
    expect(canonicalizePhone('+2348031234567')).toBe('+2348031234567');
    expect(canonicalizePhone('+234 803 123 4567')).toBe('+2348031234567');
    expect(canonicalizePhone('0803-123-4567')).toBe('+2348031234567');
    expect(canonicalizePhone('(0703) 123 4567')).toBe('+2347031234567');
  });

  it('makes the guest and vendor-signup forms match', () => {
    // A guest who booked with +234… and a vendor who signs up with 0… collapse
    // to the same canonical value — the key to upgrade-in-place.
    expect(canonicalizePhone('+2348031234567')).toBe(
      canonicalizePhone('08031234567'),
    );
  });

  it('leaves a non-Nigerian number as the stripped form', () => {
    expect(canonicalizePhone('+1 415 555 0100')).toBe('+14155550100');
  });

  it('rejects nothing but does not mangle an invalid NG number', () => {
    // Not matching the NG mobile shape → returned stripped, unchanged.
    expect(canonicalizePhone('0123')).toBe('0123');
    expect(canonicalizePhone('')).toBe('');
  });
});
