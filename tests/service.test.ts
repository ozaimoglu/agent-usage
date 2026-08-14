import { describe, expect, it, vi } from 'vitest';
import type { ProviderAdapter, ProviderSnapshot } from '../src/common/types';
import { UsageService } from '../src/main/usageService';

function adapter(id: string, result: ProviderSnapshot | Error): ProviderAdapter {
  return { id, displayName: id, detect: async () => true, fetch: async () => { if (result instanceof Error) throw result; return result; } };
}

describe('UsageService', () => {
  it('isolates failures and preserves last known good as stale', async () => {
    const previous: ProviderSnapshot = { providerId: 'bad', displayName: 'bad', status: 'ok', fetchedAt: '2026-01-01T00:00:00Z', windows: [{ label: '5h', remainingPercent: 50 }] };
    const storage = { readSnapshots: vi.fn(async () => [previous]), writeSnapshots: vi.fn(async () => undefined) };
    const good: ProviderSnapshot = { providerId: 'good', displayName: 'good', status: 'ok', fetchedAt: '2026-08-13T00:00:00Z' };
    const service = new UsageService([adapter('good', good), adapter('bad', new Error('safe failure'))], storage as never, 100, () => new Date('2026-08-13T01:00:00Z'));
    await service.initialize();
    const result = await service.refresh();
    expect(result.snapshots).toEqual([good, expect.objectContaining({ providerId: 'bad', status: 'stale', staleSince: '2026-08-13T01:00:00.000Z', error: 'safe failure' })]);
    expect(storage.writeSnapshots).toHaveBeenCalledWith(result.snapshots);
  });
  it('creates error snapshot with no cache', async () => {
    const storage = { readSnapshots: async () => [], writeSnapshots: async () => undefined };
    const service = new UsageService([adapter('x', new Error('failed'))], storage as never);
    await service.initialize();
    await expect(service.refresh()).resolves.toMatchObject({ snapshots: [expect.objectContaining({ status: 'error', error: 'failed' })] });
  });

  it('publishes fresh data even when the snapshot cache cannot be written', async () => {
    const storage = { readSnapshots: async () => [], writeSnapshots: vi.fn(async () => { throw new Error('disk full'); }) };
    const good: ProviderSnapshot = { providerId: 'good', displayName: 'good', status: 'ok', fetchedAt: '2026-08-13T00:00:00Z' };
    const service = new UsageService([adapter('good', good)], storage as never);
    const updates: boolean[] = [];
    service.on('changed', (payload) => updates.push(payload.refreshing));
    await service.initialize();
    const result = await service.refresh();
    expect(result.snapshots).toEqual([good]);
    expect(result.refreshing).toBe(false);
    expect(updates).toEqual([true, false]);
  });

  it('queues a fresh provider pass when settings change during refresh', async () => {
    let release!: () => void;
    let calls = 0;
    const good: ProviderSnapshot = { providerId: 'good', displayName: 'good', status: 'ok', fetchedAt: '2026-08-13T00:00:00Z' };
    const dynamic: ProviderAdapter = { id: 'good', displayName: 'good', detect: async () => true, fetch: async () => { calls += 1; if (calls === 1) await new Promise<void>((resolve) => { release = resolve; }); return good; } };
    const storage = { readSnapshots: async () => [], writeSnapshots: async () => undefined };
    const service = new UsageService([dynamic], storage as never);
    await service.initialize();
    const first = service.refresh();
    await vi.waitFor(() => expect(calls).toBe(1));
    const queued = service.refreshAfterCurrent();
    expect(calls).toBe(1);
    release();
    await Promise.all([first, queued]);
    expect(calls).toBe(2);
  });
  it("does not fetch or expose disabled providers", async () => {
    const enabled = new Set<string>();
    const snapshot: ProviderSnapshot = { providerId: "claude-code", displayName: "Claude Code", status: "ok", fetchedAt: "2026-08-13T00:00:00Z" };
    const fetch = vi.fn(async () => snapshot);
    const storage = { readSnapshots: async () => [snapshot], writeSnapshots: async () => undefined };
    const service = new UsageService([{ id: "claude-code", displayName: "Claude Code", detect: async () => true, fetch }], storage as never, 100, () => new Date(), (id) => enabled.has(id));
    await service.initialize();
    expect(service.get().snapshots).toEqual([]);
    await service.refresh();
    expect(fetch).not.toHaveBeenCalled();
    enabled.add("claude-code");
    await service.refresh();
    expect(fetch).toHaveBeenCalledOnce();
    enabled.delete("claude-code");
    expect(service.get().snapshots).toEqual([]);
  });

});
