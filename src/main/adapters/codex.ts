import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { ProviderAdapter, ProviderSnapshot, UsageWindow } from '../../common/types';
import { normalizeWindow } from '../../common/usage';
import { resolveExecutable } from '../executableResolver';
import type { SpawnProcess } from './process';

interface CodexAdapterOptions {
  executableOverride?: string | (() => string | undefined);
  resolve?: typeof resolveExecutable;
  spawnProcess?: SpawnProcess;
  now?: () => Date;
  discoverCodexHome?: () => Promise<string | undefined>;
}

export async function discoverCodexHome(
  inheritedHome = process.env.CODEX_HOME,
): Promise<string | undefined> {
  return inheritedHome?.trim() || undefined;
}

function number(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function resetAt(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return new Date(value < 10_000_000_000 ? value * 1000 : value).toISOString();
  return undefined;
}

function displayLimitId(id: string): string {
  return id === 'codex_bengalfox' ? 'codex_plus' : id;
}

function parseLimit(label: string, value: unknown): UsageWindow | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const item = value as Record<string, unknown>;
  const usedPercent = number(item.usedPercent ?? item.used_percent);
  const duration = number(item.windowDurationMins ?? item.windowMinutes ?? item.window_minutes ?? item.durationMinutes ?? item.duration_mins);
  const reset = resetAt(item.resetsAt ?? item.resetAt ?? item.reset_at);
  if (usedPercent === undefined && !reset && duration === undefined) return undefined;
  return normalizeWindow({ label, usedPercent, resetAt: reset, windowMinutes: duration });
}

export function parseCodexRateLimits(payload: unknown): { windows: UsageWindow[]; balance?: number; plan?: string } {
  if (!payload || typeof payload !== 'object') throw new Error('Codex yanıtı geçersiz.');
  const root = payload as Record<string, unknown>;
  const rateLimits = (root.rateLimits ?? root.rate_limits ?? root) as Record<string, unknown>;
  const rootWindows: UsageWindow[] = [];
  const primary = parseLimit('Primary', rateLimits.primary ?? rateLimits.primaryWindow ?? rateLimits.primary_window);
  const secondary = parseLimit('Secondary', rateLimits.secondary ?? rateLimits.secondaryWindow ?? rateLimits.secondary_window);
  if (primary) rootWindows.push(primary);
  if (secondary) rootWindows.push(secondary);

  const byId = rateLimits.rateLimitsByLimitId ?? rateLimits.rate_limits_by_limit_id ?? root.rateLimitsByLimitId;
  const providerWindows: UsageWindow[] = [];
  if (byId && typeof byId === 'object') {
    for (const [id, value] of Object.entries(byId)) {
      if (!value || typeof value !== 'object') continue;
      const group = value as Record<string, unknown>;
      const displayId = displayLimitId(id);
      const nestedPrimary = parseLimit(`${displayId} · Primary`, group.primary ?? group.primaryWindow ?? group.primary_window);
      const nestedSecondary = parseLimit(`${displayId} · Secondary`, group.secondary ?? group.secondaryWindow ?? group.secondary_window);
      if (nestedPrimary) providerWindows.push(nestedPrimary);
      if (nestedSecondary) providerWindows.push(nestedSecondary);
      if (!nestedPrimary && !nestedSecondary) {
        const direct = parseLimit(displayId, value);
        if (direct) providerWindows.push(direct);
      }
    }
  }
  // Current Codex versions mirror the keyed provider entry in rateLimits.
  // Prefer the richer keyed form so the same quota is not shown twice.
  const windows = providerWindows.length ? providerWindows : rootWindows;
  const credits = (rateLimits.credits ?? root.credits) as Record<string, unknown> | undefined;
  const balance = credits ? number(credits.balance ?? credits.remaining) : undefined;
  const planValue = rateLimits.planType ?? rateLimits.plan ?? root.planType ?? root.plan;
  if (!windows.length && balance === undefined) throw new Error('Codex kota alanları bulunamadı.');
  return { windows, balance, plan: typeof planValue === 'string' ? planValue : undefined };
}

const MAX_CODEX_OUTPUT_BYTES = 1024 * 1024;

function runCodexSession(
  executable: string,
  signal: AbortSignal,
  spawnProcess: SpawnProcess = spawn,
  codexHome?: string,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(executable, ['app-server', '--listen', 'stdio://'], {
      shell: false,
      stdio: 'pipe',
      ...(codexHome ? { env: { ...process.env, CODEX_HOME: codexHome } } : {}),
    }) as ChildProcessWithoutNullStreams;
    let buffer = '';
    let outputBytes = 0;
    let initialized = false;
    let settled = false;

    const finish = (error?: Error, response?: Record<string, unknown>, killSignal?: NodeJS.Signals) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      if (killSignal) child.kill(killSignal);
      if (error) reject(error);
      else resolve(response!);
    };
    const abort = () => finish(new Error('İstek zaman aşımına uğradı.'), undefined, 'SIGKILL');
    const communicationError = () => finish(new Error('Codex ile iletişim kurulamadı.'), undefined, 'SIGKILL');
    const send = (message: object) => {
      if (child.stdin.destroyed || child.stdin.writableEnded) return communicationError();
      try {
        child.stdin.write(`${JSON.stringify(message)}\n`, (error) => {
          if (error) communicationError();
        });
      } catch {
        communicationError();
      }
    };
    const handleLine = (line: string) => {
      if (!line.trim() || settled) return;
      let message: Record<string, unknown>;
      try { message = JSON.parse(line) as Record<string, unknown>; } catch { return; }
      if (message.id === 1 && !initialized) {
        if (message.error) return finish(new Error('Codex başlatılamadı.'), undefined, 'SIGKILL');
        initialized = true;
        send({ id: 2, method: 'account/rateLimits/read', params: {} });
      } else if (message.id === 2) {
        try { child.stdin.end(); } catch {
          return finish(new Error('Codex ile iletişim kurulamadı.'), undefined, 'SIGKILL');
        }
        if (message.error) finish(new Error('Codex kota yanıtı alınamadı.'), undefined, 'SIGTERM');
        else finish(undefined, message, 'SIGTERM');
      }
    };

    signal.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (chunk: Buffer | string) => {
      const text = chunk.toString();
      outputBytes += Buffer.byteLength(text);
      if (outputBytes > MAX_CODEX_OUTPUT_BYTES) return finish(new Error('Codex yanıtı çok büyük.'), undefined, 'SIGKILL');
      buffer += text;
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        handleLine(line);
        newline = buffer.indexOf('\n');
      }
    });
    child.once('error', () => finish(new Error('Sağlayıcı komutu başlatılamadı.')));
    child.stdin.once('error', communicationError);
    child.once('close', () => finish(new Error('Codex kota yanıtı alınamadı.')));
    if (signal.aborted) abort();
    else send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'agent-usage', version: '0.1.0' } } });
  });
}

export class CodexAdapter implements ProviderAdapter {
  readonly id = 'codex';
  readonly displayName = 'Codex';
  private readonly options: CodexAdapterOptions;

  constructor(options: CodexAdapterOptions = {}) { this.options = options; }

  private resolve() {
    const override = typeof this.options.executableOverride === 'function' ? this.options.executableOverride() : this.options.executableOverride;
    return (this.options.resolve ?? resolveExecutable)('codex', override);
  }

  async detect(): Promise<boolean> { return Boolean(await this.resolve()); }

  async fetch(signal: AbortSignal): Promise<ProviderSnapshot> {
    const executable = await this.resolve();
    if (!executable) return this.snapshot('unconfigured', 'Codex çalıştırılabilir dosyası bulunamadı.');
    const codexHome = await (this.options.discoverCodexHome ?? discoverCodexHome)();
    const response = await runCodexSession(executable, signal, this.options.spawnProcess, codexHome);
    const parsed = parseCodexRateLimits(response.result);
    return { providerId: this.id, displayName: this.displayName, status: 'ok', fetchedAt: this.now(), ...parsed };
  }

  private now() { return (this.options.now?.() ?? new Date()).toISOString(); }
  private snapshot(status: ProviderSnapshot['status'], error: string): ProviderSnapshot {
    return { providerId: this.id, displayName: this.displayName, status, fetchedAt: this.now(), error };
  }
}
