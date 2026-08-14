import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ProviderAdapter, ProviderSnapshot, UsageWindow } from '../../common/types';
import { normalizeWindow } from '../../common/usage';
import { resolveExecutable } from '../executableResolver';

interface ClaudeOptions {
  consent: () => boolean;
  executableOverride?: string | (() => string | undefined);
  authPath?: string;
  read?: typeof readFile;
  request?: typeof fetch;
  resolve?: typeof resolveExecutable;
  now?: () => Date;
}

const CLAUDE_USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';

export function defaultClaudeAuthPath(
  environment: NodeJS.ProcessEnv = process.env,
  homeDirectory = os.homedir(),
): string {
  const configDirectory = environment.CLAUDE_CONFIG_DIR || path.join(homeDirectory, '.claude');
  return path.join(configDirectory, '.credentials.json');
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

export function parseClaudeUsage(payload: unknown): UsageWindow[] {
  const root = asRecord(payload);
  if (!root) throw new Error('Claude Code yanıtı geçersiz.');

  const definitions = [
    ['five_hour', '5 hour', 5 * 60],
    ['seven_day', '7 day', 7 * 24 * 60],
    ['seven_day_opus', '7 day · Opus', 7 * 24 * 60],
    ['seven_day_sonnet', '7 day · Sonnet', 7 * 24 * 60],
  ] as const;

  const windows = definitions.flatMap(([key, label, windowMinutes]) => {
    const bucket = asRecord(root[key]);
    if (!bucket) return [];
    const usedPercent = asNumber(bucket.utilization);
    const resetAt = typeof bucket.resets_at === 'string' ? bucket.resets_at : undefined;
    if (usedPercent === undefined && !resetAt) return [];
    return [normalizeWindow({ label, usedPercent, resetAt, windowMinutes })];
  });

  if (!windows.length) throw new Error('Claude Code kota alanları bulunamadı.');
  return windows;
}

export class ClaudeAdapter implements ProviderAdapter {
  readonly id = 'claude-code';
  readonly displayName = 'Claude Code';

  constructor(private readonly options: ClaudeOptions) {}

  private resolve() {
    const override = typeof this.options.executableOverride === 'function'
      ? this.options.executableOverride()
      : this.options.executableOverride;
    return (this.options.resolve ?? resolveExecutable)('claude', override);
  }

  async detect(): Promise<boolean> {
    return this.options.consent() && Boolean(await this.resolve());
  }

  async fetch(signal: AbortSignal): Promise<ProviderSnapshot> {
    if (!this.options.consent()) return this.snapshot('unconfigured', 'Claude Code sağlayıcısı kapalı.');
    if (!await this.resolve()) return this.snapshot('unconfigured', 'Claude Code çalıştırılabilir dosyası bulunamadı.');

    let credentials: unknown;
    try {
      const contents = await (this.options.read ?? readFile)(
        this.options.authPath ?? defaultClaudeAuthPath(),
        'utf8',
      );
      credentials = JSON.parse(contents);
    } catch {
      return this.snapshot('unconfigured', 'Claude Code oturum bilgisi bulunamadı.');
    }

    const oauth = asRecord(asRecord(credentials)?.claudeAiOauth);
    const accessToken = oauth?.accessToken;
    if (typeof accessToken !== 'string' || !accessToken) {
      return this.snapshot('unconfigured', 'Claude Code OAuth oturumu bulunamadı.');
    }

    let response: Response;
    try {
      response = await (this.options.request ?? fetch)(CLAUDE_USAGE_URL, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          'anthropic-beta': 'oauth-2025-04-20',
        },
        signal,
      });
    } catch {
      throw new Error(signal.aborted ? 'Claude Code isteği zaman aşımına uğradı.' : 'Claude Code servisine ulaşılamadı.');
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error('Claude Code yetkilendirmesi başarısız.');
      if (response.status === 429) throw new Error('Claude Code istek sınırına ulaşıldı.');
      throw new Error('Claude Code kota servisi hata verdi.');
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error('Claude Code yanıtı geçersiz.');
    }

    return {
      providerId: this.id,
      displayName: this.displayName,
      status: 'ok',
      fetchedAt: this.now(),
      windows: parseClaudeUsage(payload),
    };
  }

  private now() { return (this.options.now?.() ?? new Date()).toISOString(); }

  private snapshot(status: ProviderSnapshot['status'], error: string): ProviderSnapshot {
    return { providerId: this.id, displayName: this.displayName, status, fetchedAt: this.now(), error };
  }
}
