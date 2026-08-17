export interface PanelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PanelSize {
  width: number;
  height: number;
}

export interface PanelPoint {
  x: number;
  y: number;
}

type Edge = 'top' | 'bottom' | 'left' | 'right';

const GAP = 10;
const FALLBACK_INSET = 12;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(value, maximum));
}

function nearestEdge(tray: PanelRect, work: PanelRect): Edge {
  const distances: Record<Edge, number> = {
    top: Math.abs(tray.y + tray.height - work.y),
    bottom: Math.abs(work.y + work.height - tray.y),
    left: Math.abs(tray.x + tray.width - work.x),
    right: Math.abs(work.x + work.width - tray.x),
  };
  return (Object.entries(distances) as Array<[Edge, number]>)
    .reduce((nearest, candidate) => candidate[1] < nearest[1] ? candidate : nearest)[0];
}

function reservedEdge(display: PanelRect, work: PanelRect): Edge {
  const insets: Record<Edge, number> = {
    top: Math.max(0, work.y - display.y),
    bottom: Math.max(0, display.y + display.height - work.y - work.height),
    left: Math.max(0, work.x - display.x),
    right: Math.max(0, display.x + display.width - work.x - work.width),
  };
  return (Object.entries(insets) as Array<[Edge, number]>)
    .reduce((largest, candidate) => candidate[1] > largest[1] ? candidate : largest)[0];
}

export function fitPanelSize(preferred: PanelSize, work: PanelRect): PanelSize {
  return {
    width: Math.max(1, Math.min(preferred.width, work.width)),
    height: Math.max(1, Math.min(preferred.height, work.height)),
  };
}

export function clampPanelHeight(height: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(height)) return minimum;
  return Math.max(minimum, Math.min(Math.round(height), maximum));
}

export function panelBlurGraceDeadline(platform: NodeJS.Platform, openedAt: number, graceMs: number): number {
  return platform === 'linux' ? openedAt + graceMs : openedAt;
}

export function calculatePanelPosition(
  panel: PanelSize,
  tray: PanelRect | undefined,
  work: PanelRect,
  display = work,
): PanelPoint {
  const maximumX = work.x + Math.max(0, work.width - panel.width);
  const maximumY = work.y + Math.max(0, work.height - panel.height);
  if (!tray || tray.width <= 0 || tray.height <= 0) {
    const edge = reservedEdge(display, work);
    const left = clamp(work.x + FALLBACK_INSET, work.x, maximumX);
    const right = clamp(maximumX - FALLBACK_INSET, work.x, maximumX);
    const top = clamp(work.y + FALLBACK_INSET, work.y, maximumY);
    const bottom = clamp(maximumY - FALLBACK_INSET, work.y, maximumY);
    if (edge === 'left') return { x: left, y: top };
    if (edge === 'right') return { x: right, y: top };
    if (edge === 'bottom') return { x: right, y: bottom };
    return { x: right, y: top };
  }

  const centeredX = Math.round(tray.x + tray.width / 2 - panel.width / 2);
  const centeredY = Math.round(tray.y + tray.height / 2 - panel.height / 2);
  switch (nearestEdge(tray, work)) {
    case 'bottom':
      return {
        x: clamp(centeredX, work.x, maximumX),
        y: clamp(tray.y - panel.height - GAP, work.y, maximumY),
      };
    case 'left':
      return {
        x: clamp(Math.max(work.x, tray.x + tray.width + GAP), work.x, maximumX),
        y: clamp(centeredY, work.y, maximumY),
      };
    case 'right':
      return {
        x: clamp(Math.min(maximumX, tray.x - panel.width - GAP), work.x, maximumX),
        y: clamp(centeredY, work.y, maximumY),
      };
    case 'top':
    default:
      return {
        x: clamp(centeredX, work.x, maximumX),
        y: clamp(Math.max(work.y, tray.y + tray.height + GAP), work.y, maximumY),
      };
  }
}
