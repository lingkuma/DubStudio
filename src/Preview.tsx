import { useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  SkipBack,
  Maximize,
  Volume2,
  LoaderCircle,
} from "lucide-react";
import { useStudio } from "./store";
import { duration, timecode, type Project } from "./model";
import { mediaUrl } from "./storage";
import { audioContext, mixAudio, paintSubtitles } from "./media";
import { report } from "./actions";
export default function Preview() {
  const { project: p, time, playing, set } = useStudio(),
    canvas = useRef<HTMLCanvasElement>(null),
    players = useRef(new Map<string, HTMLVideoElement>()),
    mix = useRef<{ project: Project; audio: AudioBuffer } | null>(null),
    source = useRef<AudioBufferSourceNode | null>(null),
    clock = useRef({ origin: 0, offset: 0 }),
    loading = useRef(false),
    [preparing, prepare] = useState(false);
  useEffect(() => {
    let stop = false;
    const ids = [...new Set(p.videos.map((v) => v.assetId))];
    for (const id of ids) {
      if (players.current.has(id)) continue;
      mediaUrl(id).then((url) => {
        if (stop) return;
        const v = document.createElement("video");
        v.muted = true;
        v.playsInline = true;
        v.preload = "auto";
        v.src = url;
        players.current.set(id, v);
      });
    }
    return () => {
      stop = true;
    };
  }, [p.videos]);
  useEffect(() => {
    if (!playing) {
      source.current?.stop();
      source.current = null;
      players.current.forEach((v) => v.pause());
      return;
    }
    let abandoned = false;
    const run = async () => {
      prepare(true);
      loading.current = true;
      const c = audioContext();
      await c.resume();
      if (mix.current?.project !== p)
        mix.current = { project: p, audio: await mixAudio(p) };
      if (abandoned) return;
      const s = c.createBufferSource();
      s.buffer = mix.current.audio;
      s.connect(c.destination);
      const offset = Math.min(
        useStudio.getState().time,
        Math.max(0, duration(p) - 0.02),
      );
      clock.current = { origin: c.currentTime, offset };
      source.current = s;
      s.start(0, offset);
      loading.current = false;
      prepare(false);
    };
    run().catch((e) => {
      report(e);
      set({ playing: false });
      prepare(false);
      loading.current = false;
    });
    return () => {
      abandoned = true;
      source.current?.stop();
      source.current = null;
      players.current.forEach((v) => v.pause());
      loading.current = false;
      prepare(false);
    };
  }, [playing, p, set]);
  useEffect(() => {
    let raf = 0,
      lastStore = 0;
    const draw = () => {
      const st = useStudio.getState(),
        p = st.project,
        c = canvas.current;
      if (!c) return;
      const end = duration(p);
      let t = st.time;
      if (st.playing && !loading.current) {
        t =
          clock.current.offset +
          audioContext().currentTime -
          clock.current.origin;
        if (t >= end) {
          t = end;
          set({ playing: false, time: end });
        } else if (performance.now() - lastStore > 35) {
          set({ time: t });
          lastStore = performance.now();
        }
      }
      const context = c.getContext("2d")!;
      context.fillStyle = "#111318";
      context.fillRect(0, 0, c.width, c.height);
      const clip = [...p.videos]
        .reverse()
        .find((v) => t >= v.start && t < v.start + v.out - v.in);
      players.current.forEach((video, id) => {
        if (!clip || id !== clip.assetId) {
          if (!video.paused) video.pause();
          return;
        }
        const at = clip.in + t - clip.start;
        if (
          video.readyState >= 1 &&
          Math.abs(video.currentTime - at) > (st.playing ? 0.16 : 0.018) &&
          !video.seeking
        )
          video.currentTime = at;
        if (st.playing && !loading.current && video.paused)
          video.play().catch(() => {});
        if (!st.playing && !video.paused) video.pause();
        if (video.readyState >= 2) {
          const scale = Math.min(
              c.width / video.videoWidth,
              c.height / video.videoHeight,
            ),
            w = video.videoWidth * scale,
            h = video.videoHeight * scale;
          context.drawImage(video, (c.width - w) / 2, (c.height - h) / 2, w, h);
        }
      });
      paintSubtitles(context, p, t, c.width, c.height);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [set]);
  useEffect(
    () => () => {
      players.current.forEach((v) => {
        v.pause();
        v.removeAttribute("src");
        v.load();
      });
    },
    [],
  );
  return (
    <section className="preview">
      <div className="panel-heading">
        <span>视频预览</span>
        <span className="meta">
          {p.width} × {p.height} · {p.fps} fps
        </span>
      </div>
      <div className="stage">
        <canvas
          ref={canvas}
          width={p.width}
          height={p.height}
          style={{ aspectRatio: p.width + "/" + p.height }}
        />
        {preparing && (
          <div className="stage-loading">
            <LoaderCircle className="spin" />
            准备同步音轨
          </div>
        )}
        {!p.videos.length && (
          <div className="stage-empty">
            <div className="frame-mark">
              <Play />
            </div>
            <h2>你的下一版，从一句话开始</h2>
            <p>导入视频，识别台词，再赋予它新的声音。</p>
          </div>
        )}
      </div>
      <div className="player-controls">
        <button
          className="icon"
          title="回到开头"
          onClick={() => set({ time: 0, playing: false })}
        >
          <SkipBack size={17} />
        </button>
        <button
          className="play-button"
          aria-label={playing ? "暂停" : "播放"}
          disabled={
            !p.videos.length || preparing || !!useStudio.getState().busy
          }
          onClick={() =>
            set({ playing: !playing, time: time >= duration(p) ? 0 : time })
          }
        >
          {playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <span className="time-readout">
          {timecode(time, true)} <span>/ {timecode(duration(p), true)}</span>
        </span>
        <div className="spacer" />
        <Volume2 size={16} />
        <button
          className="icon"
          title="全屏预览"
          onClick={() => canvas.current?.requestFullscreen()}
        >
          <Maximize size={17} />
        </button>
      </div>
      <input
        className="scrubber"
        aria-label="播放位置"
        type="range"
        min="0"
        max={Math.max(0.01, duration(p))}
        step=".01"
        value={time}
        onChange={(e) => set({ time: Number(e.target.value), playing: false })}
      />
    </section>
  );
}
