import type { Project } from "./model";

export function subtitleStyle(p: Project) {
  return {
    lineGap: Number.isFinite(p.subtitleLineGap)
      ? Math.max(0, Math.min(300, p.subtitleLineGap!))
      : 0,
    background: p.subtitleBackgroundColor ?? "#000000",
    opacity: p.subtitleBackgroundOpacity ?? 0.72,
    font: p.subtitleFont ?? "system-ui, sans-serif",
    bold: p.subtitleBold ?? true,
    outlineWidth:
      p.subtitleOutlineWidth ??
      (p.subtitleBackground ? 0 : p.subtitleSize * 0.1),
    outlineColor: p.subtitleOutlineColor ?? "#000000",
  };
}
export function backgroundRgba(color: string, opacity: number) {
  const hex = /^#[\da-f]{6}$/i.test(color) ? color.slice(1) : "000000";
  return `rgba(${parseInt(hex.slice(0, 2), 16)},${parseInt(hex.slice(2, 4), 16)},${parseInt(hex.slice(4, 6), 16)},${Math.max(0, Math.min(1, opacity))})`;
}
