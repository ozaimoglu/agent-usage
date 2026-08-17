import { describe, expect, it } from 'vitest';
import { calculatePanelPosition, clampPanelHeight, fitPanelSize, panelBlurGraceDeadline } from '../src/main/panelPosition';

const panel = { width: 390, height: 620 };
const work = { x: 72, y: 32, width: 1848, height: 1048 };

describe('panel geometry', () => {
  it('opens below a top panel icon and keeps the popover on screen', () => {
    expect(calculatePanelPosition(panel, { x: 1800, y: 0, width: 24, height: 24 }, work))
      .toEqual({ x: 1530, y: 34 });
  });

  it('uses display bounds for a tray anchor when GNOME reports a bogus work area', () => {
    const displayBounds = { x: 0, y: 0, width: 2560, height: 1440 };
    expect(calculatePanelPosition(
      { width: 410, height: 650 },
      { x: 2248, y: 8, width: 24, height: 24 },
      displayBounds,
      displayBounds,
    )).toEqual({ x: 2055, y: 42 });
  });

  it('opens beside a left dock icon and aligns vertically with it', () => {
    expect(calculatePanelPosition(panel, { x: 12, y: 360, width: 48, height: 48 }, work))
      .toEqual({ x: 72, y: 74 });
  });

  it('opens above a bottom dock icon', () => {
    expect(calculatePanelPosition(panel, { x: 900, y: 1080, width: 48, height: 48 }, work))
      .toEqual({ x: 729, y: 450 });
  });

  it('uses a safe top-right fallback when tray bounds are unavailable', () => {
    expect(calculatePanelPosition(panel, undefined, work))
      .toEqual({ x: 1518, y: 44 });
  });

  it('aligns launcher fallback beside Ubuntu left sidebar', () => {
    const display = { x: 0, y: 0, width: 1920, height: 1080 };
    expect(calculatePanelPosition(panel, undefined, work, display))
      .toEqual({ x: 84, y: 44 });
  });

  it('fits the panel inside a small scaled work area before positioning it', () => {
    const smallWork = { x: 0, y: 32, width: 360, height: 568 };
    const fitted = fitPanelSize({ width: 410, height: 650 }, smallWork);
    expect(fitted).toEqual({ width: 360, height: 568 });
    expect(calculatePanelPosition(fitted, { x: 170, y: 0, width: 24, height: 24 }, smallWork))
      .toEqual({ x: 0, y: 32 });
  });

  it('keeps content-driven heights inside the supported range', () => {
    expect(clampPanelHeight(132.4, 180, 720)).toBe(180);
    expect(clampPanelHeight(428.6, 180, 720)).toBe(429);
    expect(clampPanelHeight(910, 180, 720)).toBe(720);
    expect(clampPanelHeight(Number.NaN, 180, 720)).toBe(180);
  });

  it('limits the tray hand-off blur grace period to Linux', () => {
    expect(panelBlurGraceDeadline('linux', 1_000, 2_000)).toBe(3_000);
    expect(panelBlurGraceDeadline('darwin', 1_000, 2_000)).toBe(1_000);
    expect(panelBlurGraceDeadline('win32', 1_000, 2_000)).toBe(1_000);
  });
});
