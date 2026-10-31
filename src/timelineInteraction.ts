export const clampZoom = (value: number) => Math.max(20, Math.min(240, value));

// A wheel notch can arrive as one large delta. Spread it over a short, linear
// interval; the destination still depends only on input, not rendering speed.
export class LinearZoomMotion {
  private from: number;
  private started = 0;
  target: number;
  constructor(
    value: number,
    private duration = 80,
  ) {
    this.from = this.target = value;
  }
  value(now: number) {
    const progress = Math.max(
      0,
      Math.min(1, (now - this.started) / this.duration),
    );
    return this.from + (this.target - this.from) * progress;
  }
  moveTo(value: number, now: number) {
    this.from = this.value(now);
    this.target = clampZoom(value);
    this.started = now;
  }
  wheel(delta: number, mode: number, pageHeight: number, now: number) {
    this.moveTo(wheelZoom(this.target, delta, mode, pageHeight), now);
  }
  reset(value: number) {
    this.from = this.target = clampZoom(value);
  }
  done(now: number) {
    return now - this.started >= this.duration || this.from === this.target;
  }
}

export function wheelZoom(
  value: number,
  delta: number,
  mode: number,
  pageHeight: number,
) {
  const pixels = delta * (mode === 1 ? 16 : mode === 2 ? pageHeight : 1);
  return clampZoom(value - pixels * 0.12);
}

export const maxTimelineScroll = (
  zoom: number,
  duration: number,
  width: number,
) => Math.max(0, 24 + (duration * zoom) / 5 - width);

// Zoom IN always follows the pointer, including when either edge is visible.
// Only zoom OUT is constrained by the project edges. Zero never moves into
// artificial leading space to preserve an otherwise impossible anchor.
export function anchoredZoom(
  zoom: number,
  scroll: number,
  x: number,
  nextZoom: number,
  duration: number,
  width: number,
) {
  const time = ((scroll + x - 12) * 5) / zoom;
  const requestedScroll = (time * nextZoom) / 5 + 12 - x;
  const oldMax = maxTimelineScroll(zoom, duration, width);
  const nextMax = maxTimelineScroll(nextZoom, duration, width);
  const nextScroll =
    nextZoom > zoom
      ? Math.max(0, requestedScroll)
      : scroll <= 0.000001
        ? 0
        : scroll >= oldMax - 0.000001
          ? nextMax
          : Math.max(0, Math.min(nextMax, requestedScroll));
  return {
    zoom: nextZoom,
    origin: 12,
    scroll: nextScroll,
  };
}

export type DragRange = { start: number; end: number };
export type DragBounds = { minStart: number; maxEnd: number };
export type DragKind = "move" | "left" | "right";

// Always calculate from pointer-down, never from a previous rendered/snapped frame.
export function dragRange(
  range: DragRange,
  delta: number,
  kind: DragKind,
  bounds: DragBounds,
): DragRange {
  if (kind === "move") {
    const shift = Math.max(
      bounds.minStart - range.start,
      Math.min(bounds.maxEnd - range.end, delta),
    );
    return { start: range.start + shift, end: range.end + shift };
  }
  if (kind === "left")
    return {
      start: Math.max(
        bounds.minStart,
        Math.min(range.end - 0.04, range.start + delta),
      ),
      end: range.end,
    };
  return {
    start: range.start,
    end: Math.min(
      bounds.maxEnd,
      Math.max(range.start + 0.04, range.end + delta),
    ),
  };
}

export function snapRange(
  range: DragRange,
  kind: DragKind,
  targets: number[],
  threshold: number,
  bounds: DragBounds,
) {
  let distance = threshold,
    snapped = range;
  for (const target of targets) {
    for (const edge of kind === "move"
      ? [range.start, range.end]
      : [kind === "left" ? range.start : range.end]) {
      const delta = target - edge;
      if (Math.abs(delta) >= distance) continue;
      const next = dragRange(range, delta, kind, bounds);
      if (
        Math.abs((edge === range.start ? next.start : next.end) - target) >
        0.000001
      )
        continue;
      distance = Math.abs(delta);
      snapped = next;
    }
  }
  return snapped;
}
