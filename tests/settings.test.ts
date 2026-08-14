import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/main/storage';
import { SettingsService } from '../src/main/settingsService';

describe('SettingsService', () => {
  it('enables default autostart when onboarding completes', async () => {
    const storage = { readSettings: async () => DEFAULT_SETTINGS, writeSettings: vi.fn(async () => undefined) };
    const autostart = { setEnabled: vi.fn(async () => undefined) };
    const service = new SettingsService(storage as never, autostart);
    await service.update({ onboardingComplete: true, autostart: true });
    expect(autostart.setEnabled).toHaveBeenCalledWith(true);
  });

  it('rejects unknown top-level and nested override keys', async () => {
    const storage = { readSettings: async () => DEFAULT_SETTINGS, writeSettings: vi.fn(async () => undefined) };
    const service = new SettingsService(storage as never, { setEnabled: vi.fn() });
    await expect(service.update({ unexpected: true } as never)).rejects.toThrow('ayar alanı');
    await expect(service.update({ executableOverrides: JSON.parse('{"codex":"/tmp/codex","__proto__":"/tmp/bad"}') as never })).rejects.toThrow('yolu');
    await expect(service.update({ enabledProviders: { unknown: true } } as never)).rejects.toThrow('sağlayıcı');
    await expect(service.update({ enabledProviders: { codex: 'yes' } } as never)).rejects.toThrow('sağlayıcı');
  });

  it('rejects empty and null language values received over IPC', async () => {
    const storage = { readSettings: async () => DEFAULT_SETTINGS, writeSettings: vi.fn(async () => undefined) };
    const service = new SettingsService(storage as never, { setEnabled: vi.fn() });
    await expect(service.update({ language: '' } as never)).rejects.toThrow('dil');
    await expect(service.update({ language: null } as never)).rejects.toThrow('dil');
    expect(storage.writeSettings).not.toHaveBeenCalled();
  });

  it('rejects non-absolute executable overrides', async () => {
    const storage = { readSettings: async () => DEFAULT_SETTINGS, writeSettings: vi.fn(async () => undefined) };
    const service = new SettingsService(storage as never, { setEnabled: vi.fn() });
    await expect(service.update({ executableOverrides: { agy: 'agy' } })).rejects.toThrow('yolu');
  });

  it('does not persist settings when autostart cannot be changed', async () => {
    const storage = { readSettings: async () => DEFAULT_SETTINGS, writeSettings: vi.fn(async () => undefined) };
    const autostart = { setEnabled: vi.fn(async () => { throw new Error('autostart failed'); }) };
    const service = new SettingsService(storage as never, autostart);
    await expect(service.update({ onboardingComplete: true, autostart: true })).rejects.toThrow('autostart failed');
    expect(storage.writeSettings).toHaveBeenNthCalledWith(1, expect.objectContaining({ onboardingComplete: true }));
    expect(storage.writeSettings).toHaveBeenLastCalledWith(DEFAULT_SETTINGS);
    expect(await service.get()).toEqual(DEFAULT_SETTINGS);
  });

  it('does not touch autostart when settings cannot be persisted', async () => {
    const storage = { readSettings: async () => DEFAULT_SETTINGS, writeSettings: vi.fn(async () => { throw new Error('disk full'); }) };
    const autostart = { setEnabled: vi.fn(async () => undefined) };
    const service = new SettingsService(storage as never, autostart);
    await expect(service.update({ onboardingComplete: true, autostart: true })).rejects.toThrow('disk full');
    expect(autostart.setEnabled).not.toHaveBeenCalled();
    expect(await service.get()).toEqual(DEFAULT_SETTINGS);
  });
});
