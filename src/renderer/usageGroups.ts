import type { UsageWindow } from '../common/types';

type WindowKind = 'five-hour' | 'seven-day' | 'other';

export interface UsageDisplayGroup {
  label: string;
  primary: UsageWindow;
  primaryKind: WindowKind;
  secondary?: UsageWindow;
}

function windowKind(window: UsageWindow): WindowKind {
  if (window.windowMinutes === 5 * 60 || /(?:^|\b)(?:5\s*h|5\s*hour|five[ -]hour)(?:\b|$)/i.test(window.label)) return 'five-hour';
  if (window.windowMinutes === 7 * 24 * 60 || /(?:^|\b)(?:7\s*d|7\s*day|weekly|week)(?:\b|$)/i.test(window.label)) return 'seven-day';
  return 'other';
}

function temporalGroupLabel(label: string): string {
  return label
    .replace(/\s*(?:·|-)\s*(?:5\s*H|7\s*D)$/i, '')
    .replace(/\s*(?:5\s*hours?|five[ -]hours?|7\s*days?|weekly)$/i, '')
    .trim();
}

export function prioritizeUsageWindows(windows: UsageWindow[]): UsageDisplayGroup[] {
  const grouped = new Map<string, { label: string; fiveHour?: UsageWindow; sevenDay?: UsageWindow }>();
  const result: UsageDisplayGroup[] = [];

  windows.forEach((window) => {
    const kind = windowKind(window);
    if (kind === 'other') {
      result.push({ label: window.label, primary: window, primaryKind: kind });
      return;
    }
    const baseLabel = temporalGroupLabel(window.label);
    const key = baseLabel || 'temporal';
    const group = grouped.get(key) ?? { label: baseLabel || window.label };
    if (kind === 'five-hour') group.fiveHour = window;
    else group.sevenDay = window;
    grouped.set(key, group);
  });

  for (const group of grouped.values()) {
    const primary = group.fiveHour ?? group.sevenDay;
    if (!primary) continue;
    const primaryKind = group.fiveHour ? 'five-hour' : 'seven-day';
    const suffix = primaryKind === 'five-hour' ? '5H' : '7D';
    const label = group.label === primary.label ? primary.label : `${group.label} · ${suffix}`;
    result.push({ label, primary, primaryKind, secondary: group.fiveHour ? group.sevenDay : undefined });
  }
  return result;
}
