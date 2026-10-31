import {
  AudioClip,
  Combinator,
  MP4Clip,
  OffscreenSprite,
  type IClip,
} from "@webav/av-cliper";
import {
  activeSegments,
  dubPlacement,
  duration,
  subtitlePlacement,
  takeFor,
  uid,
  type Asset,
  type Project,
} from "./model";
import { getMedia, putMedia } from "./storage";
let ctx: AudioContext | undefined;
export function audioContext() {
  return (ctx ??= new AudioContext({ sampleRate: 48000 }));
}
const decoded = new Map<string, Promise<AudioBuffer>>();
export function decode(id: string) {
  if (!decoded.has(id))
    decoded.set(
      id,
      getMedia(id)
        .then((b) => b.arrayBuffer())
        .then((b) => audioContext().decodeAudioData(b))
        .catch((e) => {
          decoded.delete(id);
          throw new Error(
            "无法解码音频，请使用 Chrome / Edge 和常见 MP4、MP3 或 WAV 格式。" +
              e.message,
          );
        }),
    );
  return decoded.get(id)!;
}
export function wav(buffer: AudioBuffer) {
  const len = buffer.length,
    n = buffer.numberOfChannels,
    data = new ArrayBuffer(44 + len * n * 2),
    view = new DataView(data);
  const str = (at: number, s: string) =>
    [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  str(0, "RIFF");
  view.setUint32(4, 36 + len * n * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, n, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * n * 2, true);
  view.setUint16(32, n * 2, true);
  view.setUint16(34, 16, true);
  str(36, "data");
  view.setUint32(40, len * n * 2, true);
  const chans = Array.from({ length: n }, (_, c) => buffer.getChannelData(c));
  for (let i = 0; i < len; i++)
    for (let c = 0; c < n; c++) {
      const v = Math.max(-1, Math.min(1, chans[c][i]));
      view.setInt16(44 + (i * n + c) * 2, v < 0 ? v * 32768 : v * 32767, true);
    }
  return new Blob([data], { type: "audio/wav" });
}
export async function asrAudio(id: string) {
  const b = await decode(id),
    off = new OfflineAudioContext(1, Math.ceil(b.duration * 16000), 16000),
    s = off.createBufferSource();
  s.buffer = b;
  s.connect(off.destination);
  s.start();
  return wav(await off.startRendering());
}
export async function extractAudioSegment(
  id: string,
  start: number,
  length: number,
  sampleRate = 24000,
) {
  const b = await decode(id);
  if (!Number.isFinite(start) || !Number.isFinite(length) ||
    start < 0 || start >= b.duration || length <= 0)
    throw new Error("原句时间戳超出素材音轨，请在属性中调整语音起止时间");
  const safeLength = Math.min(length, b.duration - start);
  const context = new OfflineAudioContext(
    1,
    Math.ceil(safeLength * sampleRate),
    sampleRate,
  );
  const source = context.createBufferSource();
  source.buffer = b;
  source.connect(context.destination);
  source.start(0, start, safeLength);
  return wav(await context.startRendering());
}
export async function registerMedia(
  file: Blob,
  name: string,
  kind: "video" | "audio",
): Promise<Asset> {
  const id = uid();
  await putMedia(id, file);
  let d = 0,
    width = 0,
    height = 0,
    thumbnail;
  if (kind === "video") {
    const url = URL.createObjectURL(file),
      v = document.createElement("video");
    v.muted = true;
    v.preload = "metadata";
    v.src = url;
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("视频读取超时")),
          15000,
        );
        v.onloadedmetadata = () => {
          clearTimeout(timeout);
          resolve();
        };
        v.onerror = () => {
          clearTimeout(timeout);
          reject(new Error("浏览器无法读取这个视频，请使用 H.264/AAC MP4"));
        };
      });
      d = v.duration;
      width = v.videoWidth;
      height = v.videoHeight;
      if (!Number.isFinite(d) || d <= 0) throw new Error("视频时长无效");
      v.currentTime = Math.min(0.15, d / 2);
      await new Promise<void>((resolve) => {
        v.onseeked = () => resolve();
        setTimeout(resolve, 2000);
      });
      const c = document.createElement("canvas");
      c.width = 240;
      c.height = Math.max(1, Math.round((height / width) * 240));
      c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
      thumbnail = c.toDataURL("image/jpeg", 0.7);
    } finally {
      v.removeAttribute("src");
      v.load();
      URL.revokeObjectURL(url);
    }
  } else d = (await decode(id)).duration;
  const asset: Asset = {
    id,
    name,
    kind,
    duration: d,
    width,
    height,
    mime: file.type || (kind === "video" ? "video/mp4" : "audio/mpeg"),
    thumbnail,
  };
  try {
    const audio = await decode(id),
      pcm = audio.getChannelData(0),
      count = 160;
    asset.peaks = Array.from({ length: count }, (_, i) => {
      const a = Math.floor((i * pcm.length) / count),
        b = Math.floor(((i + 1) * pcm.length) / count);
      let max = 0;
      for (let j = a; j < b; j += 16) max = Math.max(max, Math.abs(pcm[j]));
      return max;
    });
  } catch {
    if (kind === "audio") throw new Error("无法读取声音文件");
  }
  return asset;
}
const stretched = new Map<string, AudioBuffer>();
export async function fitAudio(id: string, target: number) {
  const b = await decode(id);
  if (b.duration <= target + 0.02) return b;
  const key = id + ":" + target.toFixed(4);
  if (stretched.has(key)) return stretched.get(key)!;
  const rate = b.duration / target,
    modulePath = new URL(
      "/vendor/soundtouch/soundtouch.js",
      window.location.href,
    ).href,
    { SoundTouch, SimpleFilter } = await import(/* @vite-ignore */ modulePath),
    st = new SoundTouch();
  st.tempo = rate;
  st.stretch.setParameters(b.sampleRate, 0, 0, 8);
  const left = b.getChannelData(0),
    right = b.getChannelData(Math.min(1, b.numberOfChannels - 1));
  const source = {
    extract(out: Float32Array, n: number, pos: number) {
      const total = left.length + Math.ceil(b.sampleRate * 0.15),
        read = Math.max(0, Math.min(n, total - pos));
      for (let i = 0; i < read; i++) {
        out[i * 2] = left[i + pos] || 0;
        out[i * 2 + 1] = right[i + pos] || 0;
      }
      return read;
    },
  };
  const filter = new SimpleFilter(source, st),
    length = Math.max(1, Math.ceil(target * b.sampleRate)),
    out = audioContext().createBuffer(2, length, b.sampleRate),
    chunk = new Float32Array(8192 * 2);
  let pos = 0,
    round = 0;
  while (pos < length) {
    const n = filter.extract(chunk, Math.min(8192, length - pos));
    if (!n) break;
    for (let c = 0; c < 2; c++) {
      const ch = out.getChannelData(c);
      for (let i = 0; i < n; i++) ch[pos + i] = chunk[i * 2 + c];
    }
    pos += n;
    if (++round % 24 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  stretched.set(key, out);
  return out;
}
export async function mixAudio(p: Project): Promise<AudioBuffer> {
  const end = duration(p),
    off = new OfflineAudioContext(
      2,
      Math.max(1, Math.ceil(end * 48000)),
      48000,
    ),
    dubIntervals: { start: number; end: number }[] = [];
  const add = (
    b: AudioBuffer,
    start: number,
    offset: number,
    len: number,
    gain: number,
  ) => {
    if (start < 0) {
      offset -= start;
      len += start;
      start = 0;
    }
    len = Math.min(len, b.duration - offset, end - start);
    if (len <= 0.001 || offset < 0 || gain === 0) return;
    const s = off.createBufferSource(),
      g = off.createGain();
    s.buffer = b;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(gain, start + Math.min(0.005, len / 3));
    g.gain.setValueAtTime(gain, start + Math.max(0.005, len - 0.005));
    g.gain.linearRampToValueAtTime(0, start + len);
    s.connect(g).connect(off.destination);
    s.start(start, offset, len);
  };
  for (const s of activeSegments(p)) {
    const t = takeFor(s);
    if (!t || s.muted) continue;
    const b =
      s.dubDuration !== undefined || s.fit === "fit"
        ? await fitAudio(t.assetId, s.dubDuration ?? s.sourceEnd - s.sourceStart)
        : await decode(t.assetId);
    const pos = dubPlacement(p, s)!;
    const start = pos.start,
      offset = pos.offset,
      len = pos.length;
    add(b, start, offset, len, s.gain * p.dubVolume);
    dubIntervals.push({
      start,
      end: Math.min(end, pos.end),
    });
  }
  if (p.originalMode !== "mute" && p.originalVolume > 0)
    for (const c of p.videos) {
      let b: AudioBuffer;
      try {
        b = await decode(c.assetId);
      } catch {
        continue;
      }
      const clipEnd = c.start + c.out - c.in,
        points = [
          c.start,
          clipEnd,
          ...(p.originalMode === "replace"
            ? dubIntervals
                .flatMap((i) => [
                  Math.max(c.start, i.start),
                  Math.min(clipEnd, i.end),
                ])
                .filter((t) => t > c.start && t < clipEnd)
            : []),
        ].sort((a, b) => a - b);
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i],
          z = points[i + 1],
          mid = (a + z) / 2;
        if (
          p.originalMode === "replace" &&
          dubIntervals.some((q) => mid >= q.start && mid < q.end)
        )
          continue;
        add(b, a, c.in + a - c.start, z - a, c.volume * p.originalVolume);
      }
    }
  for (const c of p.music)
    add(
      await decode(c.assetId),
      c.start,
      c.in,
      c.out - c.in,
      c.volume * p.musicVolume,
    );
  // Clamp the mixed PCM before handing it to browser encoders.
  const b = await off.startRendering();
  for (let c = 0; c < b.numberOfChannels; c++) {
    const x = b.getChannelData(c);
    for (let i = 0; i < x.length; i++) x[i] = Math.max(-1, Math.min(1, x[i]));
  }
  return b;
}
export function subtitleLines(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  text: string,
  width: number,
) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const char of paragraph) {
      if (ctx.measureText(line + char).width > width && line) {
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
  const size = (p.subtitleSize * height) / p.height;
  ctx.font = "600 " + size + "px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lines = current.flatMap((s) =>
      subtitleLines(ctx, s.subtitle, width * 0.84),
    ),
    lineHeight = size * 1.45,
    bottom = height * p.subtitleY,
    start = bottom - (lines.length - 1) * lineHeight;
  lines.forEach((line, i) => {
    const y = start + i * lineHeight,
      w = ctx.measureText(line).width;
    if (p.subtitleBackground) {
      ctx.fillStyle = "rgba(0,0,0,.72)";
      ctx.fillRect(
        (width - w) / 2 - size * 0.4,
        y - size * 0.65,
        w + size * 0.8,
        size * 1.3,
      );
    } else {
      ctx.strokeStyle = "rgba(0,0,0,.8)";
      ctx.lineWidth = Math.max(2, size * 0.1);
      ctx.strokeText(line, width / 2, y);
    }
    ctx.fillStyle = p.subtitleColor;
    ctx.fillText(line, width / 2, y);
  });
}
class CaptionClip implements IClip {
  readonly meta;
  readonly ready;
  canvas: OffscreenCanvas;
  constructor(public project: Project) {
    this.meta = {
      width: project.width,
      height: project.height,
      duration: duration(project) * 1e6,
    };
    this.ready = Promise.resolve(this.meta);
    this.canvas = new OffscreenCanvas(project.width, project.height);
  }
  async tick(t: number) {
    const ctx = this.canvas.getContext("2d")!;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    paintSubtitles(
      ctx,
      this.project,
      t / 1e6,
      this.canvas.width,
      this.canvas.height,
    );
    return {
      video: await createImageBitmap(this.canvas),
      state: (t >= this.meta.duration ? "done" : "success") as
        "done" | "success",
    };
  }
  async clone() {
    return new CaptionClip(this.project) as this;
  }
  destroy() {}
}
export async function renderVideo(
  p: Project,
  onProgress: (v: number) => void,
  signal?: AbortSignal,
) {
  if (!p.videos.length) throw new Error("请先导入视频");
  if (!("VideoEncoder" in window))
    throw new Error("当前浏览器不支持视频导出，请使用最新版 Chrome / Edge");
  if (
    !(await Combinator.isSupported({
      width: p.width,
      height: p.height,
      bitrate: 4e6,
    }))
  )
    throw new Error("设备不支持当前 H.264 编码参数，请尝试降低分辨率");
  const com = new Combinator({
      width: p.width,
      height: p.height,
      fps: p.fps,
      bitrate: 4e6,
      bgColor: "#000000",
    }),
    owned: IClip[] = [];
  const check = () => {
    if (signal?.aborted) throw new DOMException("已取消导出", "AbortError");
  };
  try {
    onProgress(0.01);
    const audio = await mixAudio(p);
    check();
    onProgress(0.08);
    for (const c of p.videos) {
      check();
      let clip = new MP4Clip((await getMedia(c.assetId)).stream(), {
        audio: false,
      });
      owned.push(clip);
      await clip.ready;
      if (c.in > 0.0001) {
        const parts = await clip.split(c.in * 1e6);
        owned.push(...parts);
        clip = parts[1];
      }
      const len = c.out - c.in;
      if (len * 1e6 < clip.meta.duration - 100) {
        const parts = await clip.split(len * 1e6);
        owned.push(...parts);
        clip = parts[0];
      }
      const sprite = new OffscreenSprite(clip);
      sprite.time = { offset: c.start * 1e6, duration: len * 1e6 };
      const scale = Math.min(
        p.width / clip.meta.width,
        p.height / clip.meta.height,
      );
      sprite.rect.w = clip.meta.width * scale;
      sprite.rect.h = clip.meta.height * scale;
      sprite.rect.x = (p.width - sprite.rect.w) / 2;
      sprite.rect.y = (p.height - sprite.rect.h) / 2;
      await com.addSprite(sprite);
    }
    const ac = new AudioClip([
      audio.getChannelData(0),
      audio.getChannelData(1),
    ]);
    owned.push(ac);
    await ac.ready;
    const as = new OffscreenSprite(ac);
    as.time = { offset: 0, duration: duration(p) * 1e6 };
    await com.addSprite(as);
    if (p.subtitles) {
      const caption = new CaptionClip(p);
      owned.push(caption);
      const cs = new OffscreenSprite(caption);
      cs.zIndex = 100;
      await com.addSprite(cs);
    }
    com.on("OutputProgress", (n) => onProgress(0.1 + n * 0.9));
    const abort = () => com.destroy();
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const blob = await new Response(
        com.output({ maxTime: duration(p) * 1e6 }),
      ).blob();
      check();
      onProgress(1);
      return new Blob([blob], { type: "video/mp4" });
    } finally {
      signal?.removeEventListener("abort", abort);
    }
  } finally {
    com.destroy();
    owned.forEach((c) => {
      try {
        c.destroy();
      } catch {}
    });
  }
}
