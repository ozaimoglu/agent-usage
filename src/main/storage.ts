import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AppSettings, ProviderSnapshot } from '../common/types';
import { PROVIDER_IDS } from '../common/types';

export const DEFAULT_SETTINGS: AppSettings = {
  version: 1,
  onboardingComplete: false,
  autostart: true,
  language: 'system',
  zaiCredentialConsent: false,
  enabledProviders: {
    codex: false,
    agy: false,
    'gemini-cli': false,
    'qwen-code': false,
    opencode: false,
    'cursor-cli': false,
    'github-copilot': false,
    'zai-coding-plan': false,
    'claude-code': false,
  },
  autoDetectedProviders: [],
  providerAutoSetupVersion: 0,
  executableOverrides: {},
};

async function readJson(file: string): Promise<unknown> {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return undefined; }
}

async function atomicWrite(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, file);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validOverride(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 4096 && (value === '' || path.isAbsolute(value));
}

function sanitizeSettings(raw: unknown): AppSettings {
  if (!isRecord(raw) || raw.version !== 1) return { ...DEFAULT_SETTINGS, enabledProviders: { ...DEFAULT_SETTINGS.enabledProviders }, executableOverrides: {} };
  const overrides = isRecord(raw.executableOverrides) ? raw.executableOverrides : {};
  const providers = isRecord(raw.enabledProviders) ? raw.enabledProviders : {};
  const autoDetectedProviders = Array.isArray(raw.autoDetectedProviders)
    ? raw.autoDetectedProviders.filter((id): id is AppSettings['autoDetectedProviders'][number] => typeof id === 'string' && PROVIDER_IDS.includes(id as never))
    : [];
  return {
    version: 1,
    onboardingComplete: typeof raw.onboardingComplete === 'boolean' ? raw.onboardingComplete : DEFAULT_SETTINGS.onboardingComplete,
    autostart: typeof raw.autostart === 'boolean' ? raw.autostart : DEFAULT_SETTINGS.autostart,
    language: raw.language === 'tr' || raw.language === 'en' || raw.language === 'system' ? raw.language : DEFAULT_SETTINGS.language,
    zaiCredentialConsent: typeof raw.zaiCredentialConsent === 'boolean' ? raw.zaiCredentialConsent : DEFAULT_SETTINGS.zaiCredentialConsent,
    enabledProviders: Object.fromEntries(PROVIDER_IDS.map((id) => [
      id,
      typeof providers[id] === 'boolean' ? providers[id] : DEFAULT_SETTINGS.enabledProviders[id],
    ])) as AppSettings['enabledProviders'],
    autoDetectedProviders: [...new Set(autoDetectedProviders)],
    providerAutoSetupVersion: typeof raw.providerAutoSetupVersion === 'number' && Number.isInteger(raw.providerAutoSetupVersion) && raw.providerAutoSetupVersion >= 0
      ? raw.providerAutoSetupVersion
      : 0,
    executableOverrides: {
      ...(validOverride(overrides.codex) ? { codex: overrides.codex } : {}),
      ...(validOverride(overrides.agy) ? { agy: overrides.agy } : {}),
      ...(validOverride(overrides.claude) ? { claude: overrides.claude } : {}),
      ...(validOverride(overrides.gemini) ? { gemini: overrides.gemini } : {}),
      ...(validOverride(overrides.qwen) ? { qwen: overrides.qwen } : {}),
      ...(validOverride(overrides.opencode) ? { opencode: overrides.opencode } : {}),
      ...(validOverride(overrides['cursor-agent']) ? { 'cursor-agent': overrides['cursor-agent'] } : {}),
      ...(validOverride(overrides.copilot) ? { copilot: overrides.copilot } : {}),
    },
  };
}

export class Storage {
  constructor(private readonly directory: string) {}
  async readSettings(): Promise<AppSettings> {
    return sanitizeSettings(await readJson(path.join(this.directory, 'settings.json')));
  }
  async writeSettings(settings: AppSettings): Promise<void> {
    await atomicWrite(path.join(this.directory, 'settings.json'), settings);
  }
  async readSnapshots(): Promise<ProviderSnapshot[]> {
    const raw = await readJson(path.join(this.directory, 'snapshots.json')) as { version?: number; snapshots?: unknown } | undefined;
    return raw?.version === 1 && Array.isArray(raw.snapshots) ? raw.snapshots as ProviderSnapshot[] : [];
  }
  async writeSnapshots(snapshots: ProviderSnapshot[]): Promise<void> {
    await atomicWrite(path.join(this.directory, 'snapshots.json'), { version: 1, snapshots });
  }
}
