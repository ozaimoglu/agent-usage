import { describe, expect, it, vi } from 'vitest';
import { parseZaiQuota, ZaiAdapter } from '../src/main/adapters/zai';

const secret = 'super-secret-fixture-key';
const authRead = vi.fn(async () => JSON.stringify({ 'zai-coding-plan': { type: 'api', key: secret } }));

describe('Z.ai adapter', () => {
  it('does not read credentials without explicit consent', async () => {
    const read = vi.fn();
    const adapter = new ZaiAdapter({ consent: () => false, read: read as never });
    await expect(adapter.fetch(new AbortController().signal)).resolves.toMatchObject({ status: 'unconfigured' });
    expect(read).not.toHaveBeenCalled();
  });
  it('handles missing provider and bad credential types', async () => {
    const missing = new ZaiAdapter({ consent: () => true, read: (async () => '{}') as never });
    await expect(missing.fetch(new AbortController().signal)).resolves.toMatchObject({ status: 'unconfigured' });
    const bad = new ZaiAdapter({ consent: () => true, read: (async () => JSON.stringify({ 'zai-coding-plan': { type: 'oauth', key: secret } })) as never });
    await expect(bad.fetch(new AbortController().signal)).resolves.toMatchObject({ status: 'unconfigured' });
  });
  it('filters TIME_LIMIT while keeping token quota windows', () => {
    expect(parseZaiQuota({
      success: true,
      data: { limits: [
        { type: 'TIME_LIMIT', percentage: 10 },
        { type: 'TOKENS_LIMIT', percentage: 25 },
      ] },
    })).toEqual([
      expect.objectContaining({ label: 'TOKENS LIMIT', usedPercent: 25, remainingPercent: 75 }),
    ]);
  });

  it('requests only quota endpoint and never exposes secret', async () => {
    const request = vi.fn(async (_url: string, init: RequestInit) => {
      expect((init.headers as Record<string, string>).Authorization).toBe(secret);
      return new Response(JSON.stringify({ success: true, data: { limits: [{ type: 'TOKENS_LIMIT', percentage: 12 }] } }), { status: 200 });
    });
    const adapter = new ZaiAdapter({ consent: () => true, read: authRead as never, request: request as never });
    const snapshot = await adapter.fetch(new AbortController().signal);
    expect(request.mock.calls[0][0]).toBe('https://api.z.ai/api/monitor/usage/quota/limit');
    expect(JSON.stringify(snapshot)).not.toContain(secret);
  });
  it.each([[401, 'yetkilendirmesi'], [429, 'istek sınırına'], [500, 'servisi hata']])('sanitizes HTTP %i errors', async (status, expected) => {
    const adapter = new ZaiAdapter({ consent: () => true, read: authRead as never, request: (async () => new Response(secret, { status })) as never });
    await expect(adapter.fetch(new AbortController().signal)).rejects.toThrow(expected);
  });
  it('sanitizes timeout and malformed response errors', async () => {
    const timeout = new ZaiAdapter({ consent: () => true, read: authRead as never, request: (async () => { throw new Error(secret); }) as never });
    await expect(timeout.fetch(new AbortController().signal)).rejects.not.toThrow(secret);
    const malformed = new ZaiAdapter({ consent: () => true, read: authRead as never, request: (async () => new Response('nope')) as never });
    await expect(malformed.fetch(new AbortController().signal)).rejects.toThrow('geçersiz');
  });
});
