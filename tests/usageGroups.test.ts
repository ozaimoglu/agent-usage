import { describe, expect, it } from 'vitest';
import { prioritizeUsageWindows } from '../src/renderer/usageGroups';

describe('usage window priority', () => {
  it('uses 5H as the primary bar and keeps the matching 7D as secondary text', () => {
    const groups = prioritizeUsageWindows([
      { label: 'Gemini - 7D', windowMinutes: 10080, remainingPercent: 74 },
      { label: 'Gemini - 5H', windowMinutes: 300, remainingPercent: 92 },
      { label: 'Claude/GPT - 7D', windowMinutes: 10080, remainingPercent: 63 },
      { label: 'Claude/GPT - 5H', windowMinutes: 300, remainingPercent: 88 },
    ]);

    expect(groups).toEqual([
      expect.objectContaining({ label: 'Gemini · 5H', primary: expect.objectContaining({ remainingPercent: 92 }), secondary: expect.objectContaining({ remainingPercent: 74 }) }),
      expect.objectContaining({ label: 'Claude/GPT · 5H', primary: expect.objectContaining({ remainingPercent: 88 }), secondary: expect.objectContaining({ remainingPercent: 63 }) }),
    ]);
  });

  it('promotes 7D when no 5H window exists', () => {
    expect(prioritizeUsageWindows([
      { label: 'Codex Pro · 7D', windowMinutes: 10080, remainingPercent: 76 },
    ])).toEqual([
      expect.objectContaining({ label: 'Codex Pro · 7D', primaryKind: 'seven-day', secondary: undefined }),
    ]);
  });

  it('keeps non-temporal token limits as standalone primary bars', () => {
    expect(prioritizeUsageWindows([
      { label: 'TOKENS LIMIT', remainingPercent: 100 },
    ])).toEqual([
      expect.objectContaining({ label: 'TOKENS LIMIT', primaryKind: 'other' }),
    ]);
  });
});
