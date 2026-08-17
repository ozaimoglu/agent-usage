import { describe, expect, it } from 'vitest';
import { InstalledCliAdapter } from '../src/main/adapters/installedCli';

describe('installed CLI providers', () => {
  it('reports detected Gemini without fabricating quota data', async () => {
    const adapter = new InstalledCliAdapter({
      id: 'gemini-cli',
      displayName: 'Gemini CLI',
      executableId: 'gemini',
      resolve: async () => '/usr/local/bin/gemini',
      now: () => new Date('2026-08-17T00:00:00Z'),
    });
    await expect(adapter.detect()).resolves.toBe(true);
    await expect(adapter.fetch(new AbortController().signal)).resolves.toEqual({
      providerId: 'gemini-cli',
      displayName: 'Gemini CLI',
      status: 'ok',
      fetchedAt: '2026-08-17T00:00:00.000Z',
      plan: 'CLI',
      usageUnavailable: true,
    });
  });

  it('reports OpenCode availability without presenting past consumption as remaining quota', async () => {
    const adapter = new InstalledCliAdapter({
      id: 'opencode',
      displayName: 'OpenCode',
      executableId: 'opencode',
      resolve: async () => '/Users/test/.opencode/bin/opencode',
      now: () => new Date('2026-08-17T00:00:00Z'),
    });
    await expect(adapter.fetch(new AbortController().signal)).resolves.toEqual({
      providerId: 'opencode',
      displayName: 'OpenCode',
      status: 'ok',
      fetchedAt: '2026-08-17T00:00:00.000Z',
      plan: 'CLI',
      usageUnavailable: true,
    });
  });
});
