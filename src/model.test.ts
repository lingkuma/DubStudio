import { describe, it, expect } from "vitest";
import {
  blankProject,
  parseTranscript,
  placement,
  splitVideo,
  removeVideo,
  srt,
  parseSrt,
  dubPlacement,
  needsGeneration,
  removeVoice,
  referenceKey,
  canResumeGeneration,
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
    expect(p.segments[0].voiceId).toBe("");
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
  it("defaults transcript lines to their original audio and marks changed source ranges stale", () => {
    const p = fixture(),
      s = p.segments[0];
    s.takeId = "t";
    s.takes = [
      {
        id: "t",
        assetId: "take",
        text: s.text,
        voiceId: "",
        referenceKey: referenceKey(p, s),
        created: 0,
        duration: 5,
      },
    ];
    expect(needsGeneration(p, s)).toBe(false);
    p.videos[0].start += 10;
    expect(needsGeneration(p, s)).toBe(false);
    s.sourceEnd -= 0.25;
    expect(needsGeneration(p, s)).toBe(true);
  });
  it("deleting a custom voice returns linked sentences to the original source", () => {
    const p = fixture(),
      s = p.segments[0];
    p.voices.push({
      id: "voice",
      name: "自定义",
      assetId: "audio",
      method: "与音色参考音频相同",
      emotions: {},
      random: false,
    });
    s.voiceId = "voice";
    removeVoice(p, "voice");
    expect(s.voiceId).toBe("");
    expect(p.voices).toHaveLength(0);
  });
  it("only resumes a cloud job while the sentence's submitted settings still match", () => {
    const p = fixture(),
      s = p.segments[0];
    s.taskId = "submitted";
    s.jobText = s.text;
    s.jobVoiceId = "";
    s.jobReferenceKey = referenceKey(p, s);
    expect(canResumeGeneration(p, s)).toBe(true);
    s.sourceStart += 0.1;
    expect(canResumeGeneration(p, s)).toBe(false);
    s.sourceStart -= 0.1;
    s.voiceId = "custom";
    expect(canResumeGeneration(p, s)).toBe(false);
    s.voiceId = "";
    s.text += "已修改";
    expect(canResumeGeneration(p, s)).toBe(false);
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
  it("natural duration shows and mixes the same interval and stops at a cut", () => {
    const p = fixture(),
      s = p.segments[0];
    s.fit = "natural";
    s.takeId = "t";
    s.takes = [
      {
        id: "t",
        assetId: "voice",
        duration: 8,
        text: s.text,
        voiceId: "v",
        created: 0,
      },
    ];
    expect(dubPlacement(p, s)).toMatchObject({ start: 12, end: 20, length: 8 });
    splitVideo(p, "v1", 14);
    expect(p.segments.map((s) => dubPlacement(p, s))).toEqual([
      expect.objectContaining({ start: 12, end: 14, length: 2 }),
      expect.objectContaining({ start: 14, end: 20, offset: 2 }),
    ]);
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
