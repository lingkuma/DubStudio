import { describe, expect, it, vi } from "vitest";
import {
  blankProject,
  parseTranscript,
  speakerContext,
  speakerName,
  speakerRoster,
  speakerSnapshot,
  splitVideo,
} from "./model";
import { askAI, context } from "./ai";
import { api } from "./providers";
import { restoreSettings } from "./model";

vi.mock("./providers", () => ({ api: vi.fn() }));

function fixture() {
  const p = blankProject();
  p.videos = [
    { id: "clip", assetId: "source", start: 0, in: 0, out: 10, volume: 1 },
  ];
  p.segments = parseTranscript(
    {
      transcripts: [
        {
          channel_id: 0,
          sentences: [
            { begin_time: 0, end_time: 2000, text: "甲的台词", speaker_id: 0 },
            {
              begin_time: 2000,
              end_time: 4000,
              text: "乙的台词",
              speaker_id: 1,
            },
            {
              begin_time: 4000,
              end_time: 6000,
              text: "丙的台词",
              speaker_id: 2,
            },
            {
              begin_time: 6000,
              end_time: 8000,
              text: "甲再说一句",
              speaker_id: 0,
            },
          ],
        },
      ],
    },
    p.videos[0],
  );
  p.speakers = speakerRoster(p);
  return p;
}

describe("speaker identity and AI context", () => {
  it("keeps three distinct people and recurring turns even with identical voice selections", () => {
    const p = fixture();
    p.speakers![2].name = "小陈";
    const data = context(p);
    expect(data).toMatchObject({
      speakerCount: 3,
      speakerCountComplete: true,
      unassignedLineCount: 0,
    });
    expect(data.speakers.map((s) => [s.name, s.lineCount])).toEqual([
      ["人物 1", 2],
      ["人物 2", 1],
      ["小陈", 1],
    ]);
    expect(data.segments.map((s) => s.speakerName)).toEqual([
      "人物 1",
      "人物 2",
      "小陈",
      "人物 1",
    ]);
    expect(new Set(data.segments.map((s) => s.voiceId)).size).toBe(1);
    const restored = JSON.parse(JSON.stringify(p));
    expect(context(restored)).toEqual(data);
    splitVideo(p, "clip", 1);
    expect(speakerContext(p).speakerCount).toBe(3);
    expect(speakerName(p, p.segments.at(-1)!)).toBe("人物 1");
  });

  it("scopes ASR numbers by source and channel, while copies of a source reuse identity", () => {
    const p = fixture();
    const transcribe = (assetId: string, channel_id = 0) =>
      parseTranscript(
        {
          transcripts: [
            {
              channel_id,
              sentences: [
                {
                  begin_time: 0,
                  end_time: 1000,
                  text: "另一句",
                  speaker_id: 0,
                },
              ],
            },
          ],
        },
        { ...p.videos[0], assetId },
      )[0].speakerId;
    expect(transcribe("source")).toBe(p.segments[0].speakerId);
    expect(transcribe("other")).not.toBe(p.segments[0].speakerId);
    expect(transcribe("source", 1)).not.toBe(p.segments[0].speakerId);
  });

  it("does not invent a person for missing or invalid speaker labels in old transcripts", () => {
    const p = fixture();
    delete p.speakers;
    p.segments = parseTranscript(
      {
        transcripts: [
          {
            sentences: [
              { begin_time: 0, end_time: 1000, text: "旧台词" },
              {
                begin_time: 1000,
                end_time: 2000,
                text: "无效人物",
                speaker_id: -1,
              },
            ],
          },
        ],
      },
      p.videos[0],
    );
    expect(context(p)).toMatchObject({
      speakerCount: 0,
      speakerCountComplete: false,
      unassignedLineCount: 2,
      speakers: [],
    });
    expect(speakerName(p, p.segments[0])).toBe("未分配人物");
  });

  it("tracks manual reassignment, renaming and clip removal in the active cast", () => {
    const p = fixture();
    const before = speakerSnapshot(p);
    p.segments[2].speakerId = p.segments[1].speakerId;
    expect(speakerContext(p).speakerCount).toBe(2);
    expect(speakerSnapshot(p)).not.toBe(before);
    const assigned = speakerSnapshot(p);
    p.speakers![1].name = "经理";
    expect(speakerSnapshot(p)).not.toBe(assigned);
    p.videos[0].out = 1;
    expect(speakerContext(p).speakerCount).toBe(1);
  });

  it("sends all three named people and per-line identities with the AI rewrite request", async () => {
    const p = fixture();
    p.speakers![2].name = "小陈";
    vi.mocked(api).mockResolvedValue({
      choices: [
        { message: { content: '{"reply":"收到","edits":[],"actions":[]}' } },
      ],
    });
    await askAI(p, { ...restoreSettings(null), aiKey: "test-key" }, "改写全文");
    const call = vi.mocked(api).mock.calls.at(-1)!;
    const system = (call[2] as any).payload.messages[0].content;
    const sent = JSON.parse(system.split("当前工程：")[1]);
    expect(sent.speakerCount).toBe(3);
    expect(sent.segments[2].speakerName).toBe("小陈");
    expect(system).toContain("不得合并成两人对话");
    expect(system).toContain("实际人数未知");
  });
});
