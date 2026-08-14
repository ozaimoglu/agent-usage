import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ProviderAdapter, ProviderSnapshot, UsageWindow } from '../../common/types';
import { normalizeWindow } from '../../common/usage';

interface ZaiOptions {
  consent: () => boolean;
  authPath?: string;
  read?: typeof readFile;
  request?: typeof fetch;
  now?: () => Date;
}

export function defaultZaiAuthPath(environment = process.env): string {
  const base = environment.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  return path.join(base, 'opencode', 'auth.json');
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

export function parseZaiQuota(payload: unknown): UsageWindow[] {
  if (!payload || typeof payload !== 'object') throw new Error('Z.ai yanıtı geçersiz.');
  const root = payload as Record<string, unknown>;
  const data = root.data as Record<string, unknown> | undefined;
  if (root.success === false || !data || !Array.isArray(data.limits)) throw new Error('Z.ai kota alanları bulunamadı.');
  return data.limits.flatMap((raw) => {
    const limit = raw as Record<string, unknown>;
    const type = String(limit.type ?? limit.name ?? 'Usage').replaceAll('_', ' ').trim();
    if (type.toUpperCase() === 'TIME LIMIT') return [];
    const percentage = asNumber(limit.percentage);
    const remainingValue = asNumber(limit.remaining);
    const total = asNumber(limit.number);
    const current = asNumber(limit.currentValue ?? limit.usage);
    const used = percentage ?? (current !== undefined && total ? current / total * 100 : undefined);
    const remaining = used !== undefined ? 100 - used : (remainingValue !== undefined && total ? remainingValue / total * 100 : undefined);
    return [normalizeWindow({
      label: type,
      remainingPercent: remaining,
      usedPercent: used,
      resetAt: typeof limit.nextResetTime === 'string' ? limit.nextResetTime : undefined,
      windowMinutes: asNumber(limit.windowMinutes),
      rawUnit: total !== undefined ? String(total) : undefined,
    })];
  });
}

export class ZaiAdapter implements ProviderAdapter {
  readonly id = 'zai-coding-plan';
  readonly displayName = 'Z.ai Coding Plan';
  constructor(private readonly options: ZaiOptions) {}
  async detect(): Promise<boolean> { return this.options.consent(); }
  async fetch(signal: AbortSignal): Promise<ProviderSnapshot> {
    if (!this.options.consent()) return this.snapshot('unconfigured', 'Kimlik bilgisi okuma izni gerekli.');
    let auth: unknown;
    try {
      const contents = await (this.options.read ?? readFile)(this.options.authPath ?? defaultZaiAuthPath(), 'utf8');
      auth = JSON.parse(contents);
    } catch {
      return this.snapshot('unconfigured', 'Z.ai kimlik bilgisi bulunamadı.');
    }
    const provider = (auth as Record<string, unknown>)?.['zai-coding-plan'] as Record<string, unknown> | undefined;
    if (!provider || provider.type !== 'api' || typeof provider.key !== 'string' || !provider.key) {
      return this.snapshot('unconfigured', 'Z.ai Coding Plan kimlik bilgisi geçersiz.');
    }
    let response: Response;
    try {
      response = await (this.options.request ?? fetch)('https://api.z.ai/api/monitor/usage/quota/limit', {
        method: 'GET', headers: { Authorization: provider.key, Accept: 'application/json' }, signal,
      });
    } catch {
      throw new Error(signal.aborted ? 'Z.ai isteği zaman aşımına uğradı.' : 'Z.ai servisine ulaşılamadı.');
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error('Z.ai yetkilendirmesi başarısız.');
      if (response.status === 429) throw new Error('Z.ai istek sınırına ulaşıldı.');
      throw new Error('Z.ai kota servisi hata verdi.');
    }
    let payload: unknown;
    try { payload = await response.json(); } catch { throw new Error('Z.ai yanıtı geçersiz.'); }
    return { providerId: this.id, displayName: this.displayName, status: 'ok', fetchedAt: this.now(), windows: parseZaiQuota(payload) };
  }
  private now() { return (this.options.now?.() ?? new Date()).toISOString(); }
  private snapshot(status: ProviderSnapshot['status'], error: string): ProviderSnapshot {
    return { providerId: this.id, displayName: this.displayName, status, fetchedAt: this.now(), error };
  }
}
