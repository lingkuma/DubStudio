import { activeSegments, subtitlePlacement, type Project } from "./model";
import { backgroundRgba, subtitleStyle } from "./subtitleStyle";
export function subtitleLines(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  text: string,
  width: number,
) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const char of paragraph) {
      // Closing punctuation stays with the preceding text instead of occupying
      // a whole extra subtitle line when the user increases the font size.
      if (
        ctx.measureText(line + char).width > width &&
        line &&
        !/[，。！？、；：,.!?;:）】》」』”’]/u.test(char)
      ) {
        lines.push(line);
        line = char;
      } else line += char;
    }
    if (line) lines.push(line);
  }
  return lines;
}
export function paintSubtitles(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  p: Project,
  time: number,
  width: number,
  height: number,
) {
  if (!p.subtitles) return;
  const current = activeSegments(p).filter((s) => {
    const at = subtitlePlacement(p, s)!;
    return time >= at.start && time < at.end;
  });
  if (!current.length) return;
  ctx.save();
  const style = subtitleStyle(p);
  const size = (p.subtitleSize * height) / p.height;
  ctx.font = (style.bold ? "600 " : "400 ") + size + "px " + style.font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lines = current.flatMap((s) =>
      subtitleLines(ctx, s.subtitle, width * 0.84),
    ),
    boxHeight = size * 1.3,
    lineHeight = boxHeight + (style.lineGap * height) / p.height,
    top = height * p.subtitleY;
  if (p.subtitleBackground) {
    ctx.fillStyle = backgroundRgba(style.background, style.opacity);
    // Fill the connected line boxes as one path so fractional preview pixels
    // cannot leave seams or double the opacity at their shared edges.
    ctx.beginPath();
    lines.forEach((line, i) => {
      const w = ctx.measureText(line).width;
      ctx.rect(
        (width - w) / 2 - size * 0.4,
        top + i * lineHeight,
        w + size * 0.8,
        boxHeight,
      );
    });
    ctx.fill();
  }
  lines.forEach((line, i) => {
    const y = top + boxHeight / 2 + i * lineHeight;
    if (style.outlineWidth > 0) {
      ctx.strokeStyle = style.outlineColor;
      ctx.lineJoin = "round";
      ctx.lineWidth = (style.outlineWidth * height) / p.height;
      ctx.strokeText(line, width / 2, y);
    }
    ctx.fillStyle = p.subtitleColor;
    ctx.fillText(line, width / 2, y);
  });
  ctx.restore();
}
