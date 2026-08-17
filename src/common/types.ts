export type ProviderStatus = 'ok' | 'loading' | 'unconfigured' | 'stale' | 'error';

export interface UsageWindow {
  label: string;
  remainingPercent?: number;
  usedPercent?: number;
  resetAt?: string;
  windowMinutes?: number;
  rawUnit?: string;
  detail?: string;
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
  usageUnavailable?: boolean;
  error?: string;
}

export interface ProviderAdapter {
  readonly id: string;
  readonly displayName: string;
  detect(signal: AbortSignal): Promise<boolean>;
  fetch(signal: AbortSignal): Promise<ProviderSnapshot>;
}

export type Language = 'system' | 'tr' | 'en';
export const PROVIDER_IDS = ['codex', 'agy', 'gemini-cli', 'qwen-code', 'opencode', 'cursor-cli', 'github-copilot', 'zai-coding-plan', 'claude-code'] as const;
export type ProviderId = typeof PROVIDER_IDS[number];
export type EnabledProviders = Record<ProviderId, boolean>;
export type ExecutableId = 'codex' | 'agy' | 'claude' | 'gemini' | 'qwen' | 'opencode' | 'cursor-agent' | 'copilot';

export interface AppSettings {
  version: 1;
  onboardingComplete: boolean;
  autostart: boolean;
  language: Language;
  zaiCredentialConsent: boolean;
  enabledProviders: EnabledProviders;
  autoDetectedProviders: ProviderId[];
  providerAutoSetupVersion: number;
  executableOverrides: Partial<Record<ExecutableId, string>>;
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
    resize(height: number): Promise<void>;
    onShown(listener: () => void): () => void;
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
  viewShown: 'view:shown',
  viewSettings: 'view:settings',
  viewResize: 'view:resize',
  viewQuit: 'view:quit',
} as const;
