import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/main/storage';
import { SettingsService } from '../src/main/settingsService';
import { discoverInstalledProviders } from '../src/main/providerDiscovery';

describe('provider discovery', () => {
  it('detects supported CLIs and passes through executable overrides', async () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      executableOverrides: { qwen: '/custom/qwen' },
    };
    const resolve = vi.fn(async (name: string, override?: string) => {
      if (name === 'gemini' || name === 'opencode' || name === 'cursor-agent') return `/bin/${name}`;
      if (name === 'qwen' && override === '/custom/qwen') return override;
      return undefined;
    });
    await expect(discoverInstalledProviders(settings, resolve)).resolves.toEqual(['gemini-cli', 'qwen-code', 'opencode', 'cursor-cli']);
    expect(resolve).toHaveBeenCalledWith('qwen', '/custom/qwen');
  });

  it('enables a CLI only on its first detection and preserves later user choices', async () => {
    const current = {
      ...DEFAULT_SETTINGS,
      autoDetectedProviders: ['gemini-cli'] as const,
      providerAutoSetupVersion: 1,
      enabledProviders: { ...DEFAULT_SETTINGS.enabledProviders, 'gemini-cli': false },
    };
    const storage = { readSettings: async () => current, writeSettings: vi.fn(async () => undefined) };
    const service = new SettingsService(storage as never, { setEnabled: vi.fn() });
    const next = await service.enableNewlyDetectedProviders(['gemini-cli', 'qwen-code']);
    expect(next.enabledProviders['gemini-cli']).toBe(false);
    expect(next.enabledProviders['qwen-code']).toBe(true);
    expect(next.autoDetectedProviders).toEqual(['gemini-cli', 'qwen-code']);
  });

  it('atomically enables all installed CLIs during the first setup migration', async () => {
    const current = {
      ...DEFAULT_SETTINGS,
      autoDetectedProviders: ['gemini-cli'] as const,
      enabledProviders: { ...DEFAULT_SETTINGS.enabledProviders, 'gemini-cli': false },
    };
    const storage = { readSettings: async () => current, writeSettings: vi.fn(async () => undefined) };
    const service = new SettingsService(storage as never, { setEnabled: vi.fn() });
    const next = await service.enableNewlyDetectedProviders(['gemini-cli', 'qwen-code']);
    expect(next.enabledProviders['gemini-cli']).toBe(true);
    expect(next.enabledProviders['qwen-code']).toBe(true);
    expect(next.providerAutoSetupVersion).toBe(1);
  });
});
