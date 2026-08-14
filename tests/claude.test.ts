import { describe, expect, it, vi } from 'vitest';
import { ClaudeAdapter, defaultClaudeAuthPath, parseClaudeUsage } from '../src/main/adapters/claude';

const secret = 'fixture-claude-oauth-token';
const authRead = vi.fn(async () => JSON.stringify({ claudeAiOauth: { accessToken: secret } }));
const resolve = vi.fn(async () => '/tmp/claude');

describe('Claude Code adapter', () => {
  it('maps five-hour and weekly utilization to remaining quota', () => {
    expect(parseClaudeUsage({
      five_hour: { utilization: 21, resets_at: '2026-08-14T01:00:00Z' },
      seven_day: { utilization: 35, resets_at: '2026-08-20T01:00:00Z' },
      seven_day_opus: { utilization: 10 },
    })).toEqual([
      expect.objectContaining({ label: '5 hour', usedPercent: 21, remainingPercent: 79, windowMinutes: 300 }),
      expect.objectContaining({ label: '7 day', usedPercent: 35, remainingPercent: 65, windowMinutes: 10080 }),
      expect.objectContaining({ label: '7 day · Opus', usedPercent: 10, remainingPercent: 90 }),
    ]);
  });

  it('uses the Claude config directory without reading credentials while disabled', async () => {
    expect(defaultClaudeAuthPath({ CLAUDE_CONFIG_DIR: '/tmp/claude-config' }, '/tmp/home'))
      .toBe('/tmp/claude-config/.credentials.json');
    const read = vi.fn();
    const adapter = new ClaudeAdapter({ consent: () => false, read: read as never });
    await expect(adapter.fetch(new AbortController().signal)).resolves.toMatchObject({ status: 'unconfigured' });
    expect(read).not.toHaveBeenCalled();
  });

  it('requests only the OAuth usage endpoint and never exposes the token', async () => {
    const request = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe('https://api.anthropic.com/api/oauth/usage');
      expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${secret}`);
      return new Response(JSON.stringify({ five_hour: { utilization: 12 } }), { status: 200 });
    });
    const adapter = new ClaudeAdapter({
      consent: () => true,
      resolve: resolve as never,
      read: authRead as never,
      request: request as never,
    });
    const snapshot = await adapter.fetch(new AbortController().signal);
    expect(snapshot).toMatchObject({ providerId: 'claude-code', status: 'ok', windows: [{ remainingPercent: 88 }] });
    expect(JSON.stringify(snapshot)).not.toContain(secret);
  });

  it.each([[401, 'yetkilendirmesi'], [429, 'istek sınırına'], [500, 'servisi hata']])(
    'sanitizes HTTP %i errors',
    async (status, expected) => {
      const adapter = new ClaudeAdapter({
        consent: () => true,
        resolve: resolve as never,
        read: authRead as never,
        request: (async () => new Response(secret, { status })) as never,
      });
      await expect(adapter.fetch(new AbortController().signal)).rejects.toThrow(expected);
    },
  );
});
