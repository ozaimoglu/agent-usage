import { describe, expect, it } from 'vitest';
import { normalizeWindow, severityForRemaining, worstSeverity } from '../src/common/usage';
import { parseAgyUsage } from '../src/main/adapters/agy';
import { parseCodexRateLimits } from '../src/main/adapters/codex';
import { parseZaiQuota } from '../src/main/adapters/zai';

describe('usage normalization', () => {
  it('clamps ranges and derives complementary percentages', () => {
    expect(normalizeWindow({ label: 'x', usedPercent: 110 })).toMatchObject({ usedPercent: 100, remainingPercent: 0 });
    expect(normalizeWindow({ label: 'x', remainingPercent: -2 })).toMatchObject({ usedPercent: 100, remainingPercent: 0 });
  });
  it('uses exact thresholds and does not aggregate windows', () => {
    expect(severityForRemaining(20)).toBe('warning');
    expect(severityForRemaining(10)).toBe('critical');
    expect(worstSeverity([{ label: '5h', remainingPercent: 80 }, { label: 'week', remainingPercent: 9 }])).toBe('critical');
  });
});

describe('provider payload parsing', () => {
  it('parses Codex multiple windows, reset and balance', () => {
    const result = parseCodexRateLimits({
      rateLimits: { primary: { usedPercent: 25 } },
      rateLimitsByLimitId: { codex: { primary: { usedPercent: 25, resetsAt: 1_800_000_000, windowDurationMins: 300 }, secondary: { usedPercent: 60, windowDurationMins: 10080 } } },
      credits: { balance: '12' },
      planType: 'pro',
    });
    expect(result.windows).toHaveLength(2);
    expect(result.windows[0]).toMatchObject({ label: 'Codex Pro · 5H', remainingPercent: 75, resetAt: '2027-01-15T08:00:00.000Z', windowMinutes: 300 });
    expect(result.windows[1]).toMatchObject({ label: 'Codex Pro · 7D', remainingPercent: 40 });
    expect(result.balance).toBe(12);
    expect(result.plan).toBe('pro');
  });
  it('rejects malformed Codex payloads', () => expect(() => parseCodexRateLimits({})).toThrow('kota alanları'));
  it('parses Agy groups and missing fields', () => {
    expect(parseAgyUsage({ status: 'ok', command: { data: { groups: [{ id: 'five', name: '5 hour', window: 300, remaining_fraction: .33 }, { id: 'weekly' }] } } })).toEqual([
      expect.objectContaining({ label: '5 hour', remainingPercent: 33, usedPercent: 67, windowMinutes: 300 }),
      expect.objectContaining({ label: 'weekly' }),
    ]);
  });
  it('rejects malformed Agy payloads', () => expect(() => parseAgyUsage({ data: {} })).toThrow('grupları'));
  it('parses official Z.ai percentage and value shapes', () => {
    const windows = parseZaiQuota({ success: true, data: { limits: [{ type: 'TOKENS_LIMIT', percentage: 40, nextResetTime: '2026-08-13T12:00:00Z', number: 1000 }, { name: 'MCP', currentValue: 20, number: 100 }] } });
    expect(windows[0]).toMatchObject({ label: 'TOKENS LIMIT', usedPercent: 40, remainingPercent: 60 });
    expect(windows[1]).toMatchObject({ usedPercent: 20, remainingPercent: 80 });
  });
  it('rejects malformed Z.ai payloads', () => expect(() => parseZaiQuota({ success: true })).toThrow('kota alanları'));
});
