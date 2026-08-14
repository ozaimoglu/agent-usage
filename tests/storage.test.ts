import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, Storage } from '../src/main/storage';

describe('Storage settings validation', () => {
  it('sanitizes malformed persisted settings before exposing them to the app', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-usage-storage-'));
    try {
      await writeFile(path.join(root, 'settings.json'), JSON.stringify({
        version: 1,
        onboardingComplete: 'yes',
        autostart: true,
        language: '',
        zaiCredentialConsent: null,
        enabledProviders: { codex: false, agy: 'yes', 'claude-code': null, unknown: true },
        executableOverrides: { codex: 'codex', agy: '/opt/agy', extra: '/tmp/bad' },
      }));
      await expect(new Storage(root).readSettings()).resolves.toEqual({
        ...DEFAULT_SETTINGS,
        autostart: true,
        enabledProviders: { ...DEFAULT_SETTINGS.enabledProviders, codex: false },
        executableOverrides: { agy: '/opt/agy' },
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
