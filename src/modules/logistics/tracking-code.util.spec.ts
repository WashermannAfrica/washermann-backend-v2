import {
  makeTrackingCode,
  isTrackingCodeShaped,
  TRACKING_CODE_ALPHABET,
  TRACKING_CODE_LENGTH,
} from './tracking-code.util';

describe('tracking-code.util', () => {
  it('produces codes of the fixed length', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(makeTrackingCode()).toHaveLength(TRACKING_CODE_LENGTH);
    }
  });

  it('uses only the unambiguous alphabet and excludes confusable chars', () => {
    const re = new RegExp(`^[${TRACKING_CODE_ALPHABET}]+$`);
    for (let i = 0; i < 500; i += 1) {
      expect(makeTrackingCode()).toMatch(re);
    }
    // No 0/O, 1/I/L or U in the alphabet.
    expect(TRACKING_CODE_ALPHABET).not.toMatch(/[01ILOU]/);
  });

  it('is collision-resistant across many draws', () => {
    const seen = new Set<string>();
    const draws = 5000;
    for (let i = 0; i < draws; i += 1) seen.add(makeTrackingCode());
    // Against 30^6 ≈ 729M, 5k draws should see effectively no collisions.
    expect(seen.size).toBeGreaterThan(draws - 5);
  });

  it('recognises code-shaped strings for case-insensitive lookup', () => {
    expect(isTrackingCodeShaped('AB2CD3')).toBe(true);
    expect(isTrackingCodeShaped('ab2cd3')).toBe(true); // lowercase still shaped
    expect(isTrackingCodeShaped('short')).toBe(false); // wrong length
    expect(isTrackingCodeShaped('TOOLONG7')).toBe(false); // wrong length
    expect(isTrackingCodeShaped('abcd-1')).toBe(false); // non-alphanumeric
  });
});
