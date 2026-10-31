import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addVoice,
  auditionSegment,
  cancelGeneration,
  generate,
  recognize,
  stopAudition,
} from "./actions";
import { extractAudioSegment, registerMedia } from "./media";
import {
  blankProject,
  needsGeneration,
  parseTranscript,
  removeVoice,
} from "./model";
import { pollTts, submitTts, transcribe } from "./providers";
import { useStudio } from "./store";
import { mediaUrl } from "./storage";

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
  useStudio.getState().set({ busy: "", notice: "", generationConcurrency: 10 });
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
    const customSubmission = vi
      .mocked(submitTts)
      .mock.calls.find((call) => call[1].id === custom.id)!;
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function manySentences(count: number) {
  useStudio.getState().edit((p) => {
    const template = p.segments[0];
    p.segments = Array.from({ length: count }, (_, i) => ({
      ...structuredClone(template),
      id: "sentence-" + i,
      text: "句子" + i,
      voiceId: custom.id,
    }));
  });
  return useStudio.getState().project.segments.map((s) => s.id);
}
describe("shared generation pool", () => {
  it("starts ten tasks, refills immediately on any completion, and isolates failure", async () => {
    const ids = manySentences(13);
    const pending = Array.from({ length: 13 }, () => deferred<Blob>());
    let next = 0;
    vi.mocked(submitTts).mockImplementation(async () => "job-" + next++);
    vi.mocked(pollTts).mockImplementation(
      (id) => pending[Number(id.slice(4))].promise,
    );
    const finished = generate(ids);
    await vi.waitFor(() => expect(pollTts).toHaveBeenCalledTimes(10));
    expect(useStudio.getState()).toMatchObject({
      busy: "",
      generationActive: 10,
      generationQueued: 3,
    });
    pending[7].resolve(new Blob(["done"]));
    await vi.waitFor(() => expect(pollTts).toHaveBeenCalledTimes(11));
    expect(useStudio.getState().generationActive).toBe(10);
    pending[2].reject(new Error("单条失败"));
    await vi.waitFor(() => expect(pollTts).toHaveBeenCalledTimes(12));
    pending[4].resolve(new Blob(["done"]));
    await vi.waitFor(() => expect(pollTts).toHaveBeenCalledTimes(13));
    pending.forEach((job) => job.resolve(new Blob(["done"])));
    expect(await finished).toBe(12);
    expect(useStudio.getState()).toMatchObject({
      generationActive: 0,
      generationQueued: 0,
    });
    expect(useStudio.getState().project.segments[2]).toMatchObject({
      status: "error",
      error: "单条失败",
    });
  });
  it("single and batch clicks share capacity and do not submit a sentence twice", async () => {
    const ids = manySentences(3);
    useStudio.getState().setGenerationConcurrency(2);
    const release = deferred<Blob>();
    vi.mocked(pollTts).mockReturnValue(release.promise);
    const single = generate([ids[0]]);
    const batch = generate(ids);
    await vi.waitFor(() => expect(submitTts).toHaveBeenCalledTimes(2));
    expect(useStudio.getState().generationQueued).toBe(1);
    // Changing the limit wakes queued work without waiting for all running jobs.
    useStudio.getState().setGenerationConcurrency(3);
    await vi.waitFor(() => expect(submitTts).toHaveBeenCalledTimes(3));
    release.resolve(new Blob(["done"]));
    expect(await single).toBe(1);
    expect(await batch).toBe(3);
    expect(
      useStudio.getState().project.segments.map((s) => s.takes.length),
    ).toEqual([1, 1, 1]);
  });
  it("lowering capacity waits for running jobs to drain before refilling", async () => {
    const ids = manySentences(4),
      pending = ids.map(() => deferred<Blob>());
    useStudio.getState().setGenerationConcurrency(3);
    let next = 0;
    vi.mocked(submitTts).mockImplementation(async () => "job-" + next++);
    vi.mocked(pollTts).mockImplementation(
      (id) => pending[Number(id.slice(4))].promise,
    );
    const finished = generate(ids);
    await vi.waitFor(() => expect(pollTts).toHaveBeenCalledTimes(3));
    useStudio.getState().setGenerationConcurrency(1);
    pending[0].resolve(new Blob(["done"]));
    pending[1].resolve(new Blob(["done"]));
    await vi.waitFor(() =>
      expect(useStudio.getState().generationActive).toBe(1),
    );
    expect(pollTts).toHaveBeenCalledTimes(3);
    pending[2].resolve(new Blob(["done"]));
    await vi.waitFor(() => expect(pollTts).toHaveBeenCalledTimes(4));
    pending[3].resolve(new Blob(["done"]));
    expect(await finished).toBe(4);
  });
  it("cancels queued tasks and keeps submitted IDs for later recovery", async () => {
    const ids = manySentences(3);
    useStudio.getState().setGenerationConcurrency(1);
    vi.mocked(pollTts).mockImplementation(
      (_id, _settings, _progress, signal) =>
        new Promise((_resolve, reject) => {
          signal!.addEventListener(
            "abort",
            () => reject(new DOMException("stopped", "AbortError")),
            { once: true },
          );
        }),
    );
    const finished = generate(ids);
    await vi.waitFor(() => expect(pollTts).toHaveBeenCalledTimes(1));
    cancelGeneration();
    expect(await finished).toBe(0);
    expect(submitTts).toHaveBeenCalledTimes(1);
    const rows = useStudio.getState().project.segments;
    expect(rows[0]).toMatchObject({ status: "error", taskId: "job" });
    expect(rows.slice(1).map((s) => s.status)).toEqual(["idle", "idle"]);
    expect(useStudio.getState().generationActive).toBe(0);
  });
  it("ignores a late cloud response after switching projects", async () => {
    const ids = manySentences(1),
      pending = deferred<Blob>();
    vi.mocked(pollTts).mockReturnValue(pending.promise);
    const finished = generate(ids);
    await vi.waitFor(() => expect(pollTts).toHaveBeenCalledTimes(1));
    const fresh = blankProject();
    useStudio.getState().load(fresh);
    pending.resolve(new Blob(["late"]));
    expect(await finished).toBe(0);
    expect(useStudio.getState().project).toEqual(fresh);
    expect(registerMedia).not.toHaveBeenCalled();
  });
  it("retains the submitted text when the sentence is edited during generation", async () => {
    const ids = manySentences(1),
      pending = deferred<Blob>();
    vi.mocked(pollTts).mockReturnValue(pending.promise);
    const finished = generate(ids);
    await vi.waitFor(() => expect(pollTts).toHaveBeenCalledTimes(1));
    useStudio.getState().edit((p) => {
      p.segments[0].text = "新文本";
    });
    pending.resolve(new Blob(["done"]));
    await finished;
    const p = useStudio.getState().project;
    expect(p.segments[0].takes[0].text).toBe("句子0");
    expect(needsGeneration(p, p.segments[0])).toBe(true);
    useStudio.getState().undo();
    const restored = useStudio.getState().project;
    expect(restored.segments[0].text).toBe("句子0");
    expect(restored.segments[0].status).toBe("ready");
    expect(restored.segments[0].takes).toHaveLength(1);
    expect(
      restored.assets.some(
        (a) => a.id === restored.segments[0].takes[0].assetId,
      ),
    ).toBe(true);
    useStudio.getState().redo();
    expect(useStudio.getState().project.segments[0].text).toBe("新文本");
    expect(useStudio.getState().project.segments[0].status).toBe("ready");
  });
});

describe("sentence audition", () => {
  it("plays the source video at source timestamps, stops at sentence end, and toggles playback", async () => {
    vi.useFakeTimers();
    let current!: {
      currentTime: number;
      pause: ReturnType<typeof vi.fn>;
      play: ReturnType<typeof vi.fn>;
      onloadedmetadata?: () => void;
    };
    vi.stubGlobal(
      "Audio",
      class {
        currentTime = 0;
        pause = vi.fn();
        play = vi.fn(async () => {
          this.onloadedmetadata?.();
        });
        onloadedmetadata?: () => void;
        constructor() {
          current = this;
        }
      },
    );
    vi.mocked(mediaUrl).mockResolvedValue("blob:source");
    const id = useStudio.getState().project.segments[0].id;
    try {
      await auditionSegment(id, "original");
      expect(mediaUrl).toHaveBeenCalledWith("video");
      expect(current.currentTime).toBe(7); // Timeline time is 22s; source time is 7s.
      expect(useStudio.getState().auditioning).toBe(id + ":original");
      current.currentTime = 12;
      await vi.advanceTimersByTimeAsync(25);
      expect(current.pause).toHaveBeenCalled();
      expect(useStudio.getState().auditioning).toBeNull();
      await auditionSegment(id, "original");
      await auditionSegment(id, "original");
      expect(useStudio.getState().auditioning).toBeNull();
    } finally {
      stopAudition();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});
