import { describe, expect, it, vi } from "vitest";
import { blankProject, parseTranscript } from "./model";
import { paintSubtitles, subtitleLines } from "./subtitleRenderer";
import { subtitleStyle } from "./subtitleStyle";

function fixture() {
  const p = blankProject();
  p.videos = [
    { id: "clip", assetId: "video", start: 0, in: 0, out: 5, volume: 1 },
  ];
  p.segments = parseTranscript(
    {
      transcripts: [
        { sentences: [{ begin_time: 0, end_time: 4000, text: "字幕测试" }] },
      ],
    },
    p.videos[0],
  );
  const fills: string[] = [],
    strokes: { color: string; width: number }[] = [];
  const ctx = {
    save: vi.fn(),
    restore: vi.fn(),
    font: "",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    measureText: () => ({ width: 100 }),
    fillText: vi.fn(),
    fillRect() {
      fills.push(this.fillStyle);
    },
    strokeText() {
      strokes.push({ color: this.strokeStyle, width: this.lineWidth });
    },
  };
  return {
    p,
    ctx,
    fills,
    strokes,
    draw: (height = p.height) =>
      paintSubtitles(
        ctx as unknown as CanvasRenderingContext2D,
        p,
        1,
        p.width,
        height,
      ),
  };
}
describe("shared preview and export subtitle renderer", () => {
  it("keeps closing punctuation attached when a larger font fills the line", () => {
    const ctx = {
      measureText: (text: string) => ({ width: text.length * 10 }),
    };
    expect(
      subtitleLines(ctx as CanvasRenderingContext2D, "字幕。下一句", 20),
    ).toEqual(["字幕。", "下一", "句"]);
  });
  it("keeps legacy projects' black translucent background and bold font", () => {
    const { p, ctx, fills, strokes, draw } = fixture();
    draw();
    expect(fills).toEqual(["rgba(0,0,0,0.72)"]);
    expect(ctx.font).toBe("600 32px system-ui, sans-serif");
    expect(strokes).toEqual([]);
    p.subtitleBackground = false;
    expect(subtitleStyle(p).outlineWidth).toBe(3.2);
  });
  it("applies custom background alpha, font, size and outline at preview scale", () => {
    const { p, ctx, fills, strokes, draw } = fixture();
    Object.assign(p, {
      subtitleSize: 60,
      subtitleFont: "SimSun, serif",
      subtitleBold: false,
      subtitleBackgroundColor: "#183153",
      subtitleBackgroundOpacity: 0.35,
      subtitleOutlineWidth: 4,
      subtitleOutlineColor: "#ff0000",
    });
    draw(p.height / 2);
    expect(ctx.font).toBe("400 30px SimSun, serif");
    expect(fills).toEqual(["rgba(24,49,83,0.35)"]);
    expect(strokes).toEqual([{ color: "#ff0000", width: 2 }]);
    expect(ctx.restore).toHaveBeenCalledOnce();
  });
  it("does not draw background when disabled or any captions when hidden", () => {
    const { p, ctx, fills, draw } = fixture();
    p.subtitleBackground = false;
    draw();
    expect(fills).toEqual([]);
    expect(ctx.fillText).toHaveBeenCalledOnce();
    p.subtitles = false;
    draw();
    expect(ctx.fillText).toHaveBeenCalledOnce();
  });
});
