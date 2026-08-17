import { describe, expect, it } from 'vitest';
import { linuxTrayLabels, nearestTrayBounds, parseLinuxTrayMessage, trayBoundsAtCursor } from '../src/main/linuxTray';

describe('Linux tray bridge', () => {
  it('accepts only known helper events', () => {
    expect(parseLinuxTrayMessage('{"event":"detail"}')).toEqual({ event: 'detail' });
    expect(parseLinuxTrayMessage('{"event":"settings"}')).toEqual({ event: 'settings' });
    expect(parseLinuxTrayMessage('{"event":"quit"}')).toEqual({ event: 'quit' });
    expect(parseLinuxTrayMessage('{"event":"ready"}')).toEqual({ event: 'ready' });
    expect(parseLinuxTrayMessage('{"event":"detail","bounds":{"x":1223,"y":124,"width":40,"height":32}}'))
      .toEqual({ event: 'detail', bounds: [{ x: 1223, y: 124, width: 40, height: 32 }] });
    expect(parseLinuxTrayMessage('{"event":"settings","bounds":[{"x":1223,"y":124,"width":40,"height":32},{"x":3194,"y":4,"width":40,"height":32}]}'))
      .toEqual({ event: 'settings', bounds: [{ x: 1223, y: 124, width: 40, height: 32 }, { x: 3194, y: 4, width: 40, height: 32 }] });
    expect(parseLinuxTrayMessage('{"event":"detail","bounds":{"x":0,"y":0,"width":0,"height":32}}')).toBeUndefined();
    expect(parseLinuxTrayMessage('{"event":"detail","bounds":{"x":"0","y":0,"width":40,"height":32}}')).toBeUndefined();
    expect(parseLinuxTrayMessage('{"event":"unknown"}')).toBeUndefined();
    expect(parseLinuxTrayMessage('not json')).toBeUndefined();
  });

  it('anchors the panel around Electron cursor coordinates', () => {
    expect(trayBoundsAtCursor({ x: 1812, y: 16 }))
      .toEqual({ x: 1800, y: 4, width: 24, height: 24 });
  });

  it('selects the mirrored tray icon nearest the click without using the cursor as the anchor', () => {
    const bounds = [
      { x: 1223, y: 124, width: 40, height: 32 },
      { x: 3194, y: 4, width: 40, height: 32 },
    ];
    expect(nearestTrayBounds(bounds, { x: 3210, y: 18 })).toEqual(bounds[1]);
    expect(nearestTrayBounds(bounds, { x: 1240, y: 140 })).toEqual(bounds[0]);
  });

  it('builds concise live menu summaries for each provider', () => {
    const labels = linuxTrayLabels({ refreshing: false, snapshots: [
      { providerId: 'codex', displayName: 'Codex', status: 'ok', fetchedAt: '2026-08-13T20:00:00Z', windows: [
        { label: 'Codex Pro · 5H', remainingPercent: 85 },
        { label: 'Codex Plus · 5H', remainingPercent: 100 },
      ] },
      { providerId: 'agy', displayName: 'Agy', status: 'ok', fetchedAt: '2026-08-13T20:00:00Z', windows: [
        { label: 'Gemini Models · Weekly', remainingPercent: 70, windowMinutes: 10080 },
        { label: 'Gemini Models · Five Hour', remainingPercent: 64, windowMinutes: 300 },
      ] },
      { providerId: 'zai-coding-plan', displayName: 'Z.ai', status: 'ok', fetchedAt: '2026-08-13T20:00:00Z', windows: [
        { label: 'TOKENS LIMIT', remainingPercent: 42 },
      ] },
      { providerId: 'claude-code', displayName: 'Claude Code', status: 'ok', fetchedAt: '2026-08-13T20:00:00Z', windows: [
        { label: '5 hour', remainingPercent: 58, windowMinutes: 300 },
      ] },
    ] });
    expect(labels).toEqual({
      codexPro: "[███████░]  Codex Pro · 85%",
      codexPlus: "[████████]  Codex Plus · 100%",
      agy: "[█████░░░]  Agy 5h · 64%",
      zai: "[███░░░░░]  Z.ai · 42%",
      claude: "[█████░░░]  Claude 5h · 58%",
    });
  });
  it("hides menu rows for disabled providers", () => {
    const labels = linuxTrayLabels({ refreshing: false, snapshots: [] }, {
      codex: true, agy: false, "gemini-cli": false, "qwen-code": false, opencode: false, "cursor-cli": false, "github-copilot": false, "zai-coding-plan": false, "claude-code": false,
    });
    expect(labels.codexPro).toContain("Codex Pro");
    expect(labels.codexPlus).toContain("Codex Plus");
    expect(labels.agy).toBeNull();
    expect(labels.zai).toBeNull();
    expect(labels.claude).toBeNull();
  });

});
