export const clampZoom = (value: number) => Math.max(20, Math.min(240, value));

export function wheelZoom(
  value: number,
  delta: number,
  mode: number,
  pageHeight: number,
) {
  const pixels = delta * (mode === 1 ? 16 : mode === 2 ? pageHeight : 1);
  return clampZoom(
    value * Math.exp(-Math.max(-200, Math.min(200, pixels)) * 0.002),
  );
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
