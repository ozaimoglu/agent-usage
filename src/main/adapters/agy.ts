import type { ProviderAdapter, ProviderSnapshot, UsageWindow } from '../../common/types';
import { normalizeWindow } from '../../common/usage';
import { resolveExecutable } from '../executableResolver';
import { runProcess, type SpawnProcess } from './process';

interface AgyOptions {
  executableOverride?: string | (() => string | undefined);
  resolve?: typeof resolveExecutable;
  spawnProcess?: SpawnProcess;
  now?: () => Date;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function windowMinutes(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'weekly' || normalized === 'week' || normalized === '1w') return 7 * 24 * 60;
  if (normalized === 'daily' || normalized === 'day' || normalized === '1d') return 24 * 60;
  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*(m|min|mins?|h|hr|hrs?|d|days?)$/);
  if (!match) return undefined;
  const amount = Number(match[1]);
  const unit = match[2];
  if (unit.startsWith('h')) return amount * 60;
  if (unit.startsWith('d')) return amount * 24 * 60;
  return amount;
}

function bucketLabel(groupName: string | undefined, bucketName: string, minutes: number | undefined): string {
  const compactGroup = !groupName
    ? undefined
    : /gemini/i.test(groupName)
      ? 'Gemini'
      : /claude/i.test(groupName) && /gpt/i.test(groupName)
        ? 'Claude/GPT'
        : undefined;
  if (compactGroup) {
    if (minutes === 5 * 60) return compactGroup + ' - 5H';
    if (minutes === 7 * 24 * 60) return compactGroup + ' - 7D';
  }
  return groupName ? groupName + ' · ' + bucketName : bucketName;
}

function parseBucket(raw: unknown, groupName?: string): UsageWindow | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const bucket = raw as Record<string, unknown>;
  const fraction = asNumber(bucket.remaining_fraction ?? bucket.remainingFraction);
  const remainingPercent = fraction === undefined ? undefined : (fraction <= 1 ? fraction * 100 : fraction);
  const rawWindow = bucket.window;
  const minutes = windowMinutes(rawWindow);
  const bucketName = typeof bucket.name === 'string' ? bucket.name : String(bucket.id ?? 'Usage');
  const label = bucketLabel(groupName, bucketName, minutes);
  if (remainingPercent === undefined && typeof bucket.reset_time !== 'string' && rawWindow == null) return undefined;
  return normalizeWindow({
    label,
    remainingPercent,
    resetAt: typeof bucket.reset_time === 'string' ? bucket.reset_time : undefined,
    windowMinutes: minutes,
    rawUnit: minutes === undefined && rawWindow != null ? String(rawWindow) : undefined,
  });
}

export function parseAgyUsage(payload: unknown): UsageWindow[] {
  if (!payload || typeof payload !== 'object') throw new Error('Agy yanıtı geçersiz.');
  const root = payload as Record<string, unknown>;
  if (root.status === 'error') throw new Error('Agy kota bilgisi alınamadı.');
  const command = root.command as Record<string, unknown> | undefined;
  const data = (command?.data ?? root.data) as Record<string, unknown> | undefined;
  if (!data || !Array.isArray(data.groups)) throw new Error('Agy kota grupları bulunamadı.');

  const windows = data.groups.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const group = raw as Record<string, unknown>;
    const groupName = typeof group.name === 'string' ? group.name : undefined;
    if (Array.isArray(group.buckets)) {
      return group.buckets
        .map((bucket) => parseBucket(bucket, groupName))
        .filter((window): window is UsageWindow => Boolean(window));
    }
    const legacy = parseBucket(group) ?? normalizeWindow({
      label: groupName ?? String(group.id ?? 'Usage'),
    });
    return [legacy];
  });
  if (!windows.length) throw new Error('Agy kota limitleri bulunamadı.');
  return windows;
}

export class AgyAdapter implements ProviderAdapter {
  readonly id = 'agy';
  readonly displayName = 'Agy';
  constructor(private readonly options: AgyOptions = {}) {}
  private resolve() {
    const override = typeof this.options.executableOverride === 'function' ? this.options.executableOverride() : this.options.executableOverride;
    return (this.options.resolve ?? resolveExecutable)('agy', override);
  }
  async detect(): Promise<boolean> { return Boolean(await this.resolve()); }
  async fetch(signal: AbortSignal): Promise<ProviderSnapshot> {
    const executable = await this.resolve();
    if (!executable) return this.snapshot('unconfigured', 'Agy çalıştırılabilir dosyası bulunamadı.');
    const result = await runProcess(executable, ['--print', '/usage', '--output-format', 'json'], signal, this.options.spawnProcess);
    if (result.code !== 0) throw new Error('Agy kota bilgisi alınamadı.');
    let payload: unknown;
    try { payload = JSON.parse(result.stdout); } catch { throw new Error('Agy yanıtı geçersiz.'); }
    return { providerId: this.id, displayName: this.displayName, status: 'ok', fetchedAt: this.now(), windows: parseAgyUsage(payload) };
  }
  private now() { return (this.options.now?.() ?? new Date()).toISOString(); }
  private snapshot(status: ProviderSnapshot['status'], error: string): ProviderSnapshot {
    return { providerId: this.id, displayName: this.displayName, status, fetchedAt: this.now(), error };
  }
}
