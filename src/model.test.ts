import { describe, it, expect } from "vitest";
import {
  blankProject,
  parseTranscript,
  placement,
  splitVideo,
  removeVideo,
  srt,
  parseSrt,
} from "./model";
import { parseAI } from "./ai";
function fixture() {
  const p = blankProject();
  p.videos = [{ id: "v1", assetId: "a", start: 10, in: 5, out: 25, volume: 1 }];
  p.segments = parseTranscript(
    {
      transcripts: [
        { sentences: [{ begin_time: 7000, end_time: 12000, text: "原句" }] },
      ],
    },
    p.videos[0],
  );
  return p;
}
describe("source / timeline mapping", () => {
  it("maps source times after trimming and moving", () => {
    const p = fixture();
    expect(placement(p, p.segments[0])).toMatchObject({
      start: 12,
      end: 17,
      cut: 0,
    });
    p.videos[0].in = 9;
    expect(placement(p, p.segments[0])).toMatchObject({
      start: 10,
      end: 13,
      cut: 2,
    });
  });
  it("splits crossing sentences while preserving audio source offsets", () => {
    const p = fixture();
    splitVideo(p, "v1", 14);
    expect(p.videos).toHaveLength(2);
    expect(p.segments).toHaveLength(2);
    expect(p.segments.map((s) => placement(p, s))).toEqual([
      expect.objectContaining({ start: 12, end: 14, cut: 0 }),
      expect.objectContaining({ start: 14, end: 17, cut: 2 }),
    ]);
  });
  it("ripple removal shifts later clips and removes linked sentences", () => {
    const p = fixture();
    p.videos.push({
      id: "v2",
      assetId: "a",
      start: 30,
      in: 0,
      out: 5,
      volume: 1,
    });
    removeVideo(p, "v1", true);
    expect(p.videos[0].start).toBe(10);
    expect(p.segments).toHaveLength(0);
  });
  it("round trips edited subtitles to SRT on timeline times", () => {
    const p = fixture();
    p.segments[0].subtitle = "新字幕";
    const parsed = parseSrt(srt(p));
    expect(parsed).toEqual([{ start: 12, end: 17, text: "新字幕" }]);
  });
});
describe("AI proposal validation", () => {
  it("rejects unknown IDs atomically", () => {
    const p = fixture();
    expect(() =>
      parseAI(JSON.stringify({ edits: [{ id: "invented", text: "bad" }] }), p),
    ).toThrow("不存在");
    expect(p.segments[0].text).toBe("原句");
  });
  it("preserves stable IDs and validates executable actions", () => {
    const p = fixture(),
      id = p.segments[0].id;
    const r = parseAI(
      JSON.stringify({
        reply: "好",
        edits: [{ id, text: "新句" }],
        actions: [{ type: "generate", ids: [id] }, { type: "export" }],
      }),
      p,
    );
    expect(r.edits[0].id).toBe(id);
    expect(r.actions).toHaveLength(2);
  });
});
