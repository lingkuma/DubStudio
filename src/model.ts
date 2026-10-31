export type Asset = {
  id: string;
  name: string;
  kind: "video" | "audio";
  duration: number;
  width: number;
  height: number;
  mime: string;
  thumbnail?: string;
  peaks?: number[];
};
export type VideoClip = {
  id: string;
  assetId: string;
  start: number;
  in: number;
  out: number;
  volume: number;
};
export type Take = {
  id: string;
  assetId: string;
  text: string;
  voiceId: string;
  referenceKey?: string;
  created: number;
  duration: number;
};
export type Segment = {
  id: string;
  clipId: string;
  sourceStart: number;
  sourceEnd: number;
  original: string;
  text: string;
  subtitle: string;
  syncText: boolean;
  voiceId: string;
  takeId?: string;
  takes: Take[];
  status: "idle" | "queued" | "generating" | "ready" | "error";
  error?: string;
  taskId?: string;
  jobText?: string;
  jobVoiceId?: string;
  jobReferenceKey?: string;
  dubOffset: number;
  subtitleOffset: number;
  gain: number;
  fit: "fit" | "natural";
  muted: boolean;
};
export type Voice = {
  id: string;
  name: string;
  assetId: string;
  emotionAssetId?: string;
  method: string;
  emotions: Record<string, number>;
  random: boolean;
};
export type MusicClip = {
  id: string;
  assetId: string;
  start: number;
  in: number;
  out: number;
  volume: number;
};
export type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  created: number;
};
export type Project = {
  proposal?: {
    result: {
      reply: string;
      edits: { id: string; text?: string; subtitle?: string }[];
      actions: {
        type: "generate" | "export" | "seek" | "split" | "remove";
        ids?: string[];
        time?: number;
        clipId?: string;
      }[];
    };
    before: Record<string, string>;
    projectId: string;
    beforeTimeline: string;
  };
  version: 1;
  id: string;
  name: string;
  assets: Asset[];
  videos: VideoClip[];
  segments: Segment[];
  voices: Voice[];
  music: MusicClip[];
  messages: Message[];
  width: number;
  height: number;
  fps: number;
  originalMode: "replace" | "mix" | "mute";
  originalVolume: number;
  dubVolume: number;
  musicVolume: number;
  subtitles: boolean;
  subtitleSize: number;
  subtitleColor: string;
  subtitleBackground: boolean;
  subtitleY: number;
  created: number;
  updated: number;
};
export type Channel = "asr" | "tts" | "ai";
export type Connection = {
  transport: "gateway" | "direct" | "worker";
  gateway: string;
  workerUrl: string;
  downloadFallback: boolean;
};
export type Settings = {
  aliyunKey: string;
  autodlKey: string;
  asrBase: string;
  autodlBase: string;
  connections: Record<Channel, Connection>;
  remember: boolean;
  diarization: boolean;
  hotwords: string;
  aiBase: string;
  aiKey: string;
  aiModel: string;
};
export const defaults: Settings = {
  aliyunKey: "",
  autodlKey: "",
  asrBase: "https://dashscope.aliyuncs.com",
  autodlBase: "https://autodl.art",
  connections: {
    asr: { transport: "gateway", gateway: "/api/gateway", workerUrl: "", downloadFallback: true },
    tts: { transport: "direct", gateway: "/api/gateway", workerUrl: "", downloadFallback: true },
    ai: { transport: "gateway", gateway: "/api/gateway", workerUrl: "", downloadFallback: true },
  },
  remember: false,
  diarization: false,
  hotwords: "",
  aiBase: "https://api.0-0.pro/v1",
  aiKey: "",
  aiModel: "gemini-4-argon",
};
export function restoreSettings(saved: unknown): Settings {
  const old = saved && typeof saved === "object"
    ? saved as Partial<Settings> & { transport?: "direct" | "gateway"; gateway?: string }
    : {};
  const { transport, gateway, connections, ...rest } = old;
  const migrated = { ...defaults, ...rest, connections: {} as Settings["connections"] };
  for (const channel of ["asr", "tts", "ai"] as const) {
    migrated.connections[channel] = {
      ...defaults.connections[channel],
      ...(transport && channel !== "tts" ? { transport } : {}),
      ...(gateway ? { gateway } : {}),
      ...connections?.[channel],
    };
  }
  return migrated;
}
export const uid = () => crypto.randomUUID();
export const blankProject = (): Project => ({
  version: 1,
  id: uid(),
  name: "未命名项目",
  assets: [],
  videos: [],
  segments: [],
  voices: [],
  music: [],
  messages: [],
  width: 1280,
  height: 720,
  fps: 24,
  originalMode: "replace",
  originalVolume: 1,
  dubVolume: 1,
  musicVolume: 0.25,
  subtitles: true,
  subtitleSize: 32,
  subtitleColor: "#ffffff",
  subtitleBackground: true,
  subtitleY: 0.9,
  created: Date.now(),
  updated: Date.now(),
});
export const duration = (p: Project) =>
  Math.max(
    0,
    ...p.videos.map((c) => c.start + c.out - c.in),
    ...p.music.map((c) => c.start + c.out - c.in),
  );
export const takeFor = (s: Segment) => s.takes.find((t) => t.id === s.takeId);
// Empty voiceId means the original audio at this sentence's source timestamps.
export function referenceKey(p: Project, s: Segment) {
  if (!s.voiceId)
    return JSON.stringify([
      "original",
      p.videos.find((v) => v.id === s.clipId)?.assetId,
      s.sourceStart,
      s.sourceEnd,
    ]);
  const v = p.voices.find((v) => v.id === s.voiceId);
  return JSON.stringify([
    "voice", s.voiceId, v?.assetId, v?.method, v?.random,
    v?.emotionAssetId,
    Object.entries(v?.emotions || {}).sort(([a], [b]) => a.localeCompare(b)),
  ]);
}
export function needsGeneration(p: Project, s: Segment) {
  const take = takeFor(s);
  return !take || take.text !== s.text ||
    (take.voiceId || "") !== (s.voiceId || "") ||
    (take.referenceKey !== undefined && take.referenceKey !== referenceKey(p, s));
}
export function canResumeGeneration(p: Project, s: Segment) {
  return !!s.taskId &&
    (s.jobText ?? s.text) === s.text &&
    (s.jobVoiceId ?? s.voiceId ?? "") === (s.voiceId || "") &&
    (s.jobReferenceKey === undefined || s.jobReferenceKey === referenceKey(p, s));
}
export function removeVoice(p: Project, id: string) {
  p.voices = p.voices.filter((v) => v.id !== id);
  for (const s of p.segments) if (s.voiceId === id) s.voiceId = "";
  // Keep media for undo and any other clips or takes sharing the asset.
}
export function dubPlacement(p: Project, s: Segment) {
  const at = placement(p, s),
    take = takeFor(s),
    clip = p.videos.find((v) => v.id === s.clipId);
  if (!at || !take || !clip) return null;
  const begin = at.start + s.dubOffset,
    clipEnd = clip.start + clip.out - clip.in;
  const end =
    s.fit === "fit" || clip.out < s.sourceEnd
      ? at.end + s.dubOffset
      : Math.min(clipEnd, begin + take.duration - at.cut);
  return {
    start: Math.max(0, begin),
    end: Math.max(0, end),
    offset: at.cut + Math.max(0, -begin),
    length: Math.max(0, end - Math.max(0, begin)),
  };
}
export function placement(p: Project, s: Segment) {
  const c = p.videos.find((v) => v.id === s.clipId);
  if (!c) return null;
  const a = Math.max(c.in, s.sourceStart),
    b = Math.min(c.out, s.sourceEnd);
  if (b <= a) return null;
  return {
    start: c.start + a - c.in,
    end: c.start + b - c.in,
    cut: a - s.sourceStart,
    sourceStart: a,
    sourceEnd: b,
  };
}
export function activeSegments(p: Project) {
  return p.segments
    .filter((s) => placement(p, s))
    .sort((a, b) => placement(p, a)!.start - placement(p, b)!.start);
}
export function splitVideo(p: Project, id: string, time: number) {
  const c = p.videos.find((x) => x.id === id);
  if (!c) return;
  const cut = c.in + time - c.start;
  if (cut <= c.in + 0.04 || cut >= c.out - 0.04) return;
  const right = { ...c, id: uid(), start: time, in: cut };
  c.out = cut;
  p.videos.push(right);
  for (const s of [...p.segments.filter((s) => s.clipId === id)]) {
    if (s.sourceStart >= cut) s.clipId = right.id;
    else if (s.sourceEnd > cut)
      p.segments.push({ ...structuredClone(s), id: uid(), clipId: right.id });
  }
}
export function removeVideo(p: Project, id: string, ripple = false) {
  const c = p.videos.find((v) => v.id === id);
  if (!c) return;
  p.videos = p.videos.filter((v) => v.id !== id);
  p.segments = p.segments.filter((s) => s.clipId !== id);
  if (ripple) {
    const end = c.start + c.out - c.in,
      delta = c.out - c.in;
    p.videos.forEach((v) => {
      if (v.start >= end - 0.001) v.start -= delta;
    });
    p.music.forEach((v) => {
      if (v.start >= end - 0.001) v.start = Math.max(0, v.start - delta);
    });
  }
}
export function parseTranscript(
  data: unknown,
  clip: VideoClip,
  voiceId = "",
): Segment[] {
  const d = data as any;
  const ts = d.transcripts || d.output?.transcripts || [];
  const list = ts.flatMap((t: any) => t.sentences || []);
  return list
    .filter(
      (s: any) =>
        Number.isFinite(s.begin_time) &&
        Number.isFinite(s.end_time) &&
        s.end_time > s.begin_time,
    )
    .map((s: any) => ({
      id: uid(),
      clipId: clip.id,
      sourceStart: s.begin_time / 1000,
      sourceEnd: s.end_time / 1000,
      original: String(s.text || ""),
      text: String(s.text || ""),
      subtitle: String(s.text || ""),
      syncText: true,
      voiceId,
      takes: [],
      status: "idle",
      dubOffset: 0,
      subtitleOffset: 0,
      gain: 1,
      fit: "fit",
      muted: false,
    }));
}
export function timecode(s: number, ms = false) {
  s = Math.max(0, s);
  s = Math.round(s * 1000) / 1000;
  const m = Math.floor(s / 60),
    sec = Math.floor(s % 60);
  return (
    String(m).padStart(2, "0") +
    ":" +
    String(sec).padStart(2, "0") +
    (ms ? "." + String(Math.round((s % 1) * 1000)).padStart(3, "0") : "")
  );
}
export function srt(p: Project) {
  const stamp = (v: number) => {
    const t = Math.max(0, Math.round(v * 1000));
    return (
      String(Math.floor(t / 3600000)).padStart(2, "0") +
      ":" +
      String(Math.floor(t / 60000) % 60).padStart(2, "0") +
      ":" +
      String(Math.floor(t / 1000) % 60).padStart(2, "0") +
      "," +
      String(t % 1000).padStart(3, "0")
    );
  };
  return activeSegments(p)
    .map((s, i) => {
      const at = placement(p, s)!;
      return (
        i +
        1 +
        "\n" +
        stamp(at.start + s.subtitleOffset) +
        " --> " +
        stamp(at.end + s.subtitleOffset) +
        "\n" +
        s.subtitle +
        "\n"
      );
    })
    .join("\n");
}
export function parseSrt(text: string) {
  return text
    .replace(/^\uFEFF/, "")
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .flatMap((block) => {
      const lines = block.split("\n");
      const i = lines.findIndex((l) => l.includes("-->"));
      if (i < 0) return [];
      const stamps = lines[i].match(/(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})/g);
      if (!stamps || stamps.length !== 2) return [];
      const n = (s: string) => {
        const [h, m, sec, ms] = s.split(/[:,.]/).map(Number);
        return h * 3600 + m * 60 + sec + ms / 1000;
      };
      return [
        {
          start: n(stamps[0]),
          end: n(stamps[1]),
          text: lines
            .slice(i + 1)
            .join("\n")
            .trim(),
        },
      ];
    });
}
