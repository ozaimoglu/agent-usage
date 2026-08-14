import type { UsageWindow } from './types';

export function clampPercent(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.min(100, Math.max(0, value));
}

export function normalizeWindow(window: UsageWindow): UsageWindow {
  const used = clampPercent(window.usedPercent);
  const remaining = clampPercent(window.remainingPercent ?? (used === undefined ? undefined : 100 - used));
  return {
    ...window,
    usedPercent: used ?? (remaining === undefined ? undefined : 100 - remaining),
    remainingPercent: remaining,
  };
}

export type Severity = 'normal' | 'warning' | 'critical' | 'unknown';

export function severityForRemaining(value?: number): Severity {
  if (value === undefined) return 'unknown';
  if (value <= 10) return 'critical';
  if (value <= 20) return 'warning';
  return 'normal';
}

export function worstSeverity(windows: UsageWindow[]): Severity {
  const order: Record<Severity, number> = { unknown: 0, normal: 1, warning: 2, critical: 3 };
  return windows.reduce<Severity>((worst, item) => {
    const current = severityForRemaining(item.remainingPercent);
    return order[current] > order[worst] ? current : worst;
  }, 'unknown');
}
