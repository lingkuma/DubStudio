import { beforeEach, describe, expect, it, vi } from "vitest";
import { addVoice, generate, recognize } from "./actions";
import { extractAudioSegment, registerMedia } from "./media";
import {
  blankProject,
  needsGeneration,
  parseTranscript,
  removeVoice,
} from "./model";
import { pollTts, submitTts, transcribe } from "./providers";
import { useStudio } from "./store";

vi.mock("./media", () => ({
  asrAudio: vi.fn(async () => new Blob(["asr"])),
  extractAudioSegment: vi.fn(),
  registerMedia: vi.fn(),
  renderVideo: vi.fn(),
}));
vi.mock("./storage", () => ({
  download: vi.fn(),
  getMedia: vi.fn(),
  mediaUrl: vi.fn(),
}));
vi.mock("./providers", () => ({
  submitTts: vi.fn(),
  pollTts: vi.fn(),
  transcribe: vi.fn(),
}));

const transcript = {
  transcripts: [
    {
      sentences: [
        { begin_time: 7000, end_time: 12000, text: "第一句" },
        { begin_time: 14000, end_time: 15500, text: "第二句" },
      ],
    },
  ],
};
const custom = {
  id: "custom",
  name: "自定义",
  assetId: "reference",
  method: "使用情感向量控制",
  emotions: { emo_angry: 0.8 },
  random: false,
};

beforeEach(() => {
  vi.resetAllMocks();
  const p = blankProject();
  p.videos = [
    { id: "clip", assetId: "video", start: 20, in: 5, out: 25, volume: 1 },
  ];
  p.voices = [structuredClone(custom)];
  p.segments = parseTranscript(transcript, p.videos[0]);
  useStudio.getState().load(p);
  useStudio.getState().set({ busy: "", notice: "" });
  vi.mocked(extractAudioSegment).mockResolvedValue(
    new Blob(["original"], { type: "audio/wav" }),
  );
  vi.mocked(submitTts).mockResolvedValue("job");
  vi.mocked(pollTts).mockResolvedValue(new Blob(["result"]));
  vi.mocked(transcribe).mockResolvedValue(transcript);
  let serial = 0;
  vi.mocked(registerMedia).mockImplementation(async (_blob, name, kind) => ({
    id: "result-" + serial++,
    name,
    kind,
    duration: 2,
    width: 0,
    height: 0,
    mime: "audio/wav",
  }));
});

describe("sentence reference selection", () => {
  it("uploading a custom voice keeps every sentence's existing source", async () => {
    useStudio.getState().edit((p) => {
      p.segments[1].voiceId = custom.id;
    });
    await addVoice(new File(["reference"], "新音色.wav"));
    expect(useStudio.getState().project.segments.map((s) => s.voiceId)).toEqual(
      ["", custom.id],
    );
    await recognize();
    expect(useStudio.getState().project.segments.map((s) => s.voiceId)).toEqual(
      ["", ""],
    );
  });

  it("single generation extracts the original source timestamps without adding a reference asset", async () => {
    useStudio.getState().edit((p) => {
      p.voices = [];
    });
    const id = useStudio.getState().project.segments[0].id;
    expect(await generate([id])).toBe(1);
    expect(extractAudioSegment).toHaveBeenCalledWith("video", 7, 5);
    const submission = vi.mocked(submitTts).mock.calls[0];
    expect(submission[1]).toMatchObject({
      method: "与音色参考音频相同",
      random: false,
      emotions: {},
    });
    expect(await submission[4]?.text()).toBe("original");
    const p = useStudio.getState().project;
    expect(p.assets).toHaveLength(1);
    expect(p.voices).toHaveLength(0);
    expect(needsGeneration(p, p.segments[0])).toBe(false);
  });

  it("batch generation honors per-sentence original and custom references", async () => {
    useStudio.getState().edit((p) => {
      p.segments[1].voiceId = custom.id;
    });
    expect(
      await generate(useStudio.getState().project.segments.map((s) => s.id)),
    ).toBe(2);
    expect(extractAudioSegment).toHaveBeenCalledTimes(1);
    const customSubmission = vi.mocked(submitTts).mock.calls[1];
    expect(customSubmission[1]).toEqual(custom);
    expect(customSubmission[4]).toBeUndefined();
    const p = useStudio.getState().project;
    expect(p.segments.map((s) => needsGeneration(p, s))).toEqual([
      false,
      false,
    ]);
    useStudio.getState().edit((p) => {
      p.voices[0].emotions.emo_angry = 0.4;
    });
    const changed = useStudio.getState().project;
    expect(changed.segments.map((s) => needsGeneration(changed, s))).toEqual([
      false,
      true,
    ]);
  });

  it("original task recovery uses the submitted configuration after a source edit", async () => {
    const id = useStudio.getState().project.segments[0].id;
    vi.mocked(pollTts).mockRejectedValueOnce(
      new DOMException("Stopped", "AbortError"),
    );
    await generate([id]);
    useStudio.getState().edit((p) => {
      p.segments[0].voiceId = custom.id;
      p.segments[0].sourceStart = 8;
    });
    expect(await generate([id], true)).toBe(1);
    expect(submitTts).toHaveBeenCalledTimes(1);
    expect(extractAudioSegment).toHaveBeenCalledTimes(1);
    const p = useStudio.getState().project;
    expect(p.segments[0].takes[0].voiceId).toBe("");
    expect(needsGeneration(p, p.segments[0])).toBe(true);
  });

  it("can recover a submitted custom task after its library voice was deleted", async () => {
    useStudio.getState().edit((p) => {
      p.segments[0].voiceId = custom.id;
    });
    const id = useStudio.getState().project.segments[0].id;
    vi.mocked(pollTts).mockRejectedValueOnce(
      new DOMException("Stopped", "AbortError"),
    );
    await generate([id]);
    useStudio.getState().edit((p) => removeVoice(p, custom.id));
    expect(await generate([id], true)).toBe(1);
    expect(submitTts).toHaveBeenCalledTimes(1);
    expect(extractAudioSegment).not.toHaveBeenCalled();
    const p = useStudio.getState().project;
    expect(p.segments[0].takes[0].voiceId).toBe(custom.id);
    expect(needsGeneration(p, p.segments[0])).toBe(true);
  });

  it("submits changed settings instead of retaining the previous cloud job", async () => {
    const id = useStudio.getState().project.segments[0].id;
    vi.mocked(pollTts).mockRejectedValueOnce(
      new DOMException("Stopped", "AbortError"),
    );
    await generate([id]);
    useStudio.getState().edit((p) => {
      p.segments[0].voiceId = custom.id;
    });
    vi.mocked(submitTts).mockRejectedValueOnce(new Error("提交失败"));
    await generate([id]);
    expect(submitTts).toHaveBeenCalledTimes(2);
    expect(useStudio.getState().project.segments[0].taskId).toBeUndefined();
    expect(useStudio.getState().project.segments[0].jobVoiceId).toBe(custom.id);
  });

  it("reports failed original extraction on the sentence and releases the task lock", async () => {
    const id = useStudio.getState().project.segments[0].id;
    vi.mocked(extractAudioSegment).mockRejectedValueOnce(
      new Error("音轨不可用"),
    );
    await generate([id]);
    expect(submitTts).not.toHaveBeenCalled();
    expect(useStudio.getState().project.segments[0]).toMatchObject({
      status: "error",
      error: "音轨不可用",
    });
    expect(useStudio.getState().busy).toBe("");
  });
});
