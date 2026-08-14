export type ProviderStatus = 'ok' | 'loading' | 'unconfigured' | 'stale' | 'error';

export interface UsageWindow {
  label: string;
  remainingPercent?: number;
  usedPercent?: number;
  resetAt?: string;
  windowMinutes?: number;
  rawUnit?: string;
}

export interface ProviderSnapshot {
  providerId: string;
  displayName: string;
  status: ProviderStatus;
  fetchedAt: string;
  staleSince?: string;
  plan?: string;
  balance?: number;
  windows?: UsageWindow[];
  error?: string;
}

export interface ProviderAdapter {
  readonly id: string;
  readonly displayName: string;
  detect(signal: AbortSignal): Promise<boolean>;
  fetch(signal: AbortSignal): Promise<ProviderSnapshot>;
}

export type Language = 'system' | 'tr' | 'en';
export const PROVIDER_IDS = ['codex', 'agy', 'zai-coding-plan', 'claude-code'] as const;
export type ProviderId = typeof PROVIDER_IDS[number];
export type EnabledProviders = Record<ProviderId, boolean>;

export interface AppSettings {
  version: 1;
  onboardingComplete: boolean;
  autostart: boolean;
  language: Language;
  zaiCredentialConsent: boolean;
  enabledProviders: EnabledProviders;
  executableOverrides: Partial<Record<'codex' | 'agy' | 'claude', string>>;
}

export interface UsagePayload {
  snapshots: ProviderSnapshot[];
  refreshing: boolean;
}

export interface RendererApi {
  usage: {
    get(): Promise<UsagePayload>;
    refresh(): Promise<UsagePayload>;
    onChanged(listener: (payload: UsagePayload) => void): () => void;
  };
  view: {
    quit(): Promise<void>;
    onSettings(listener: () => void): () => void;
  };
  settings: {
    get(): Promise<AppSettings>;
    update(patch: Partial<AppSettings>): Promise<AppSettings>;
  };
}

export const IPC = {
  usageGet: 'usage:get',
  usageRefresh: 'usage:refresh',
  usageChanged: 'usage:changed',
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  viewSettings: 'view:settings',
  viewQuit: 'view:quit',
} as const;
