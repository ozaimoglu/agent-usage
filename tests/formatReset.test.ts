import { describe, expect, it } from 'vitest';
import { formatReset } from '../src/renderer/formatReset';

describe('formatReset', () => {
  const now = Date.UTC(2026, 7, 13, 10, 0, 0);

  it('shows durations longer than a day as days and hours', () => {
    const resetAt = new Date(now + (2 * 24 + 3) * 60 * 60 * 1_000).toISOString();

    expect(formatReset(resetAt, 'en', 'Unknown', now)).toMatch(/^2d 3h · /);
  });

  it('keeps shorter durations in hours and minutes', () => {
    const resetAt = new Date(now + 65 * 60 * 1_000).toISOString();

    expect(formatReset(resetAt, 'tr', 'Bilinmiyor', now)).toMatch(/^1h 5dk · /);
    expect(formatReset(resetAt, 'en', 'Unknown', now)).toMatch(/^1h 5m · /);
  });

  it('falls back for an invalid timestamp', () => {
    expect(formatReset('not-a-date', 'tr', 'Bilinmiyor', now)).toBe('Bilinmiyor');
  });
});
