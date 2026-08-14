import { spawn } from 'node:child_process';
import type { EnabledProviders, UsagePayload, UsageWindow } from '../common/types';
import type { PanelRect } from './panelPosition';

const MAX_MESSAGE_BUFFER = 4_096;
const TRAY_ICON_SIZE = 24;

interface LinuxTrayMessage {
  event: 'detail' | 'settings' | 'quit' | 'ready';
  bounds?: PanelRect[];
}

export interface LinuxTrayLabels {
  codexPro: string | null;
  codexPlus: string | null;
  agy: string | null;
  zai: string | null;
  claude: string | null;
}

export interface LinuxTrayController {
  update(labels: LinuxTrayLabels): void;
  stop(): void;
}

export interface LinuxTrayOptions {
  helperPath: string;
  iconPath: string;
  onDetail(bounds?: PanelRect[]): void;
  onSettings(bounds?: PanelRect[]): void;
  onQuit(): void;
  onError(error: Error): void;
}

function textBar(label: string, window?: UsageWindow): string {
  const value = window?.remainingPercent;
  if (value === undefined || !Number.isFinite(value)) return `[░░░░░░░░]  ${label} · —`;
  const percent = Math.min(100, Math.max(0, Math.round(value)));
  const filled = Math.round(percent / 12.5);
  return `[${"█".repeat(filled)}${"░".repeat(8 - filled)}]  ${label} · ${percent}%`;
}

export function linuxTrayLabels(payload: UsagePayload, enabled?: EnabledProviders): LinuxTrayLabels {
  const codex = payload.snapshots.find((snapshot) => snapshot.providerId === 'codex');
  const codexWindows = codex?.windows ?? [];
  const standard = codexWindows.find((window) => /(^|·\s*)codex\s*·/i.test(`${window.label} ·`))
    ?? codexWindows.find((window) => !/plus/i.test(window.label));
  const plus = codexWindows.find((window) => /codex_plus|plus/i.test(window.label));

  const agy = payload.snapshots.find((snapshot) => snapshot.providerId === 'agy');
  const agyWindows = agy?.windows ?? [];
  const agyFiveHour = agyWindows.find((window) => window.windowMinutes === 300 && /gemini/i.test(window.label))
    ?? agyWindows.find((window) => window.windowMinutes === 300);
  const zai = payload.snapshots.find((snapshot) => snapshot.providerId === 'zai-coding-plan');
  const claude = payload.snapshots.find((snapshot) => snapshot.providerId === 'claude-code');
  const claudeFiveHour = claude?.windows?.find((window) => window.windowMinutes === 300) ?? claude?.windows?.[0];
  const isEnabled = (id: keyof EnabledProviders, present: boolean) => enabled ? enabled[id] : present;
  return {
    codexPro: isEnabled('codex', Boolean(codex)) ? textBar("Codex Pro", standard ?? codexWindows[0]) : null,
    codexPlus: isEnabled('codex', Boolean(codex)) ? textBar("Codex Plus", plus) : null,
    agy: isEnabled('agy', Boolean(agy)) ? textBar("Agy 5h", agyFiveHour) : null,
    zai: isEnabled('zai-coding-plan', Boolean(zai)) ? textBar("Z.ai", zai?.windows?.[0]) : null,
    claude: isEnabled('claude-code', Boolean(claude)) ? textBar("Claude 5h", claudeFiveHour) : null,
  };
}

export function parseLinuxTrayMessage(line: string): LinuxTrayMessage | undefined {
  try {
    const value: unknown = JSON.parse(line);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const message = value as { event?: unknown; bounds?: unknown };
    const event = message.event;
    if (event !== 'detail' && event !== 'settings' && event !== 'quit' && event !== 'ready') return undefined;
    if (message.bounds === undefined) return { event };
    const parseRect = (candidate: unknown): PanelRect | undefined => {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return undefined;
      const rect = candidate as Record<string, unknown>;
      const coordinates = [rect.x, rect.y, rect.width, rect.height];
      if (!coordinates.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))) return undefined;
      if ((rect.width as number) <= 0 || (rect.height as number) <= 0 || (rect.width as number) > 512 || (rect.height as number) > 512) return undefined;
      return { x: rect.x as number, y: rect.y as number, width: rect.width as number, height: rect.height as number };
    };
    const rawBounds = Array.isArray(message.bounds) ? message.bounds : [message.bounds];
    if (!rawBounds.length) return undefined;
    const bounds = rawBounds.map(parseRect);
    if (bounds.some((rect) => !rect)) return undefined;
    return { event, bounds: bounds as PanelRect[] };
  } catch {
    return undefined;
  }
}

export function trayBoundsAtCursor(point: { x: number; y: number }): PanelRect {
  const half = Math.floor(TRAY_ICON_SIZE / 2);
  return { x: point.x - half, y: point.y - half, width: TRAY_ICON_SIZE, height: TRAY_ICON_SIZE };
}

export function nearestTrayBounds(bounds: PanelRect[], point: { x: number; y: number }): PanelRect | undefined {
  return bounds.reduce<PanelRect | undefined>((nearest, candidate) => {
    if (!nearest) return candidate;
    const distance = (rect: PanelRect) => {
      const centerX = rect.x + rect.width / 2;
      const centerY = rect.y + rect.height / 2;
      return (centerX - point.x) ** 2 + (centerY - point.y) ** 2;
    };
    return distance(candidate) < distance(nearest) ? candidate : nearest;
  }, undefined);
}

export function startLinuxTray(options: LinuxTrayOptions): LinuxTrayController {
  const child = spawn('python3', [options.helperPath, options.iconPath, String(process.pid)], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stopped = false;
  let reportedFailure = false;
  let stdoutBuffer = '';
  let stderrBuffer = '';

  const reportFailure = (error: Error) => {
    if (stopped || reportedFailure) return;
    reportedFailure = true;
    options.onError(error);
  };

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    stdoutBuffer += chunk;
    if (stdoutBuffer.length > MAX_MESSAGE_BUFFER) stdoutBuffer = stdoutBuffer.slice(-MAX_MESSAGE_BUFFER);
    const lines = stdoutBuffer.split('\n');
    stdoutBuffer = lines.pop() ?? '';
    for (const line of lines) {
      const message = parseLinuxTrayMessage(line);
      if (message?.event === 'detail') options.onDetail(message.bounds);
      else if (message?.event === 'settings') options.onSettings(message.bounds);
      else if (message?.event === 'quit') options.onQuit();
    }
  });

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    stderrBuffer = (stderrBuffer + chunk).slice(-2_048);
  });
  child.once('error', (error) => reportFailure(error));
  child.stdin.once('error', (error) => reportFailure(error));
  child.once('exit', (code, signal) => {
    if (stopped) return;
    const detail = stderrBuffer.trim();
    reportFailure(new Error(
      `Linux tray helper kapandı (${signal ?? code ?? 'bilinmeyen'}).${detail ? ` ${detail}` : ''}`,
    ));
  });

  return {
    update(labels) {
      if (stopped || child.stdin.destroyed || child.stdin.writableEnded) return;
      child.stdin.write(`${JSON.stringify({ event: 'update', labels })}\n`);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      child.stdin.end();
      child.kill('SIGTERM');
    },
  };
}
