import path from 'node:path';
import type { AppSettings } from '../common/types';
import { PROVIDER_IDS } from '../common/types';
import type { AutostartManager } from './autostart';
import type { Storage } from './storage';

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validOverride(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 4096 && (value === '' || path.isAbsolute(value));
}

export class SettingsService {
  private value?: AppSettings;
  constructor(private readonly storage: Storage, private readonly autostart: AutostartManager) {}
  async get(): Promise<AppSettings> { return this.value ??= await this.storage.readSettings(); }
  async update(patch: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.get();
    if (!isPlainRecord(patch)) throw new Error('Geçersiz ayar isteği.');
    const allowed = new Set(['onboardingComplete', 'autostart', 'language', 'zaiCredentialConsent', 'enabledProviders', 'executableOverrides']);
    if (Object.keys(patch).some((key) => !allowed.has(key))) throw new Error('Geçersiz ayar alanı.');
    if (patch.language !== undefined && !['system', 'tr', 'en'].includes(patch.language)) throw new Error('Geçersiz dil.');
    for (const key of ['onboardingComplete', 'autostart', 'zaiCredentialConsent'] as const) {
      if (patch[key] !== undefined && typeof patch[key] !== 'boolean') throw new Error('Geçersiz ayar değeri.');
    }
    if (patch.enabledProviders !== undefined) {
      if (!isPlainRecord(patch.enabledProviders)) throw new Error('Geçersiz sağlayıcı ayarı.');
      const entries = Object.entries(patch.enabledProviders);
      if (entries.some(([key, value]) => !PROVIDER_IDS.includes(key as never) || typeof value !== 'boolean')) throw new Error('Geçersiz sağlayıcı ayarı.');
    }
    if (patch.executableOverrides) {
      if (!isPlainRecord(patch.executableOverrides)) throw new Error('Geçersiz çalıştırılabilir dosya yolları.');
      const entries = Object.entries(patch.executableOverrides);
      if (entries.some(([key, value]) => !['codex', 'agy', 'claude', 'gemini', 'qwen', 'opencode', 'cursor-agent', 'copilot'].includes(key) || !validOverride(value))) throw new Error('Geçersiz çalıştırılabilir dosya yolu.');
    }
    const next: AppSettings = { ...current, ...patch, version: 1, enabledProviders: { ...current.enabledProviders, ...patch.enabledProviders }, executableOverrides: { ...current.executableOverrides, ...patch.executableOverrides } };
    const updateAutostart = (patch.autostart !== undefined && patch.autostart !== current.autostart)
      || (patch.onboardingComplete === true && !current.onboardingComplete && next.autostart);
    await this.storage.writeSettings(next);
    if (updateAutostart) {
      try {
        await this.autostart.setEnabled(next.autostart);
      } catch (error) {
        try {
          await this.storage.writeSettings(current);
        } catch {
          throw new Error('Ayar ve otomatik başlangıç durumu eşitlenemedi.');
        }
        throw error;
      }
    }
    this.value = next;
    return next;
  }

  async enableNewlyDetectedProviders(detected: AppSettings['autoDetectedProviders']): Promise<AppSettings> {
    const current = await this.get();
    const alreadyDetected = new Set(current.autoDetectedProviders);
    const needsInitialSetup = current.providerAutoSetupVersion < 1;
    const newlyDetected = needsInitialSetup ? detected : detected.filter((id) => !alreadyDetected.has(id));
    if (!needsInitialSetup && !newlyDetected.length) return current;
    const enabledProviders = { ...current.enabledProviders };
    newlyDetected.forEach((id) => { enabledProviders[id] = true; });
    const next: AppSettings = {
      ...current,
      enabledProviders,
      autoDetectedProviders: [...new Set([...current.autoDetectedProviders, ...detected])],
      providerAutoSetupVersion: 1,
    };
    await this.storage.writeSettings(next);
    this.value = next;
    return next;
  }
}
