import { useEffect, useMemo, useRef, useState } from "react";
import { Timeline, type TimelineState } from "@xzdarcy/react-timeline-editor";
import type { TimelineRow } from "@xzdarcy/timeline-engine";
import "@xzdarcy/react-timeline-editor/dist/react-timeline-editor.css";
import {
  Scissors,
  Trash2,
  Magnet,
  Minus,
  Plus,
  Film,
  AudioLines,
  Mic,
  Type,
  Music2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useStudio } from "./store";
import {
  activeSegments,
  duration,
  dubPlacement,
  placement,
  resizeSegment,
  removeVideo,
  splitVideo,
  subtitlePlacement,
  takeFor,
  timecode,
} from "./model";
import { report } from "./actions";
export default function EditorTimeline() {
  const { project: p, time, selected, edit, set, busy } = useStudio(),
    ref = useRef<TimelineState>(null),
    [zoom, setZoom] = useState(60),
    [snap, setSnap] = useState(true),
    [height, setHeight] = useState(300);
  const labelsRef = useRef<HTMLDivElement>(null);
  const rows = useMemo<TimelineRow[]>(
    () => [
      {
        id: "video",
        actions: p.videos.map((v) => ({
          id: v.id,
          start: v.start,
          end: v.start + v.out - v.in,
          effectId: "video",
        })),
      },
      {
        id: "original",
        actions: p.videos.map((v) => ({
          id: "o:" + v.id,
          start: v.start,
          end: v.start + v.out - v.in,
          effectId: "original",
          movable: false,
          flexible: false,
        })),
      },
      {
        id: "dub",
        actions: activeSegments(p).map((s) => {
          const at = placement(p, s)!,
            dub = dubPlacement(p, s);
          return {
            id: "d:" + s.id,
            start: dub?.start ?? Math.max(0, at.start + s.dubOffset),
            end: dub?.end ?? at.end + s.dubOffset,
            effectId: "dub",
            maxEnd: duration(p),
          };
        }),
      },
      {
        id: "subtitle",
        actions: activeSegments(p).map((s) => {
          const at = subtitlePlacement(p, s)!;
          return {
            id: "s:" + s.id,
            start: at.start,
            end: at.end,
            effectId: "subtitle",
            maxEnd: duration(p),
          };
        }),
      },
      {
        id: "music",
        actions: p.music.map((v) => ({
          id: v.id,
          start: v.start,
          end: v.start + v.out - v.in,
          effectId: "music",
        })),
      },
    ],
    [p],
  );
  useEffect(() => {
    ref.current?.setTime(time);
  }, [time]);
  const select = (id: string) =>
    set({
      selected: id.replace(/^[dso]:/, ""),
    });
  const modify = (
    id: string,
    start: number,
    end: number,
    kind: "move" | "trim",
  ) => {
    edit((p) => {
      const c =
        p.videos.find((v) => v.id === id) || p.music.find((v) => v.id === id);
      if (c) {
        const a = p.assets.find((a) => a.id === c.assetId)!;
        if (kind === "move") {
          c.start = Math.max(0, start);
        } else {
          const delta = start - c.start,
            newIn = Math.max(0, Math.min(c.out - 0.04, c.in + delta)),
            newOut = Math.max(
              newIn + 0.04,
              Math.min(a.duration, c.in + end - c.start),
            );
          c.start = Math.max(0, start);
          c.in = newIn;
          c.out = newOut;
        }
        return;
      }
      const s = p.segments.find((s) => s.id === id.slice(2));
      if (!s) return;
      const at = placement(p, s)!;
      const track = id.startsWith("d:") ? "dub" : "subtitle";
      if (kind === "trim") resizeSegment(p, s, track, start, end);
      else {
        const current = track === "dub"
          ? dubPlacement(p, s) ?? { start: Math.max(0, at.start + s.dubOffset) }
          : subtitlePlacement(p, s)!;
        if (track === "dub") s.dubOffset += start - current.start;
        else s.subtitleOffset += start - current.start;
      }
    });
  };
  const split = () => {
    const c =
      p.videos.find((v) => v.id === selected) ||
      p.videos.find((v) => time > v.start && time < v.start + v.out - v.in);
    if (!c) {
      report("将播放头移动到视频片段内再分割");
      return;
    }
    edit((p) => splitVideo(p, c.id, time));
  };
  const del = () => {
    if (!selected) return;
    edit((p) => {
      if (p.videos.some((v) => v.id === selected)) removeVideo(p, selected);
      else if (p.music.some((v) => v.id === selected))
        p.music = p.music.filter((v) => v.id !== selected);
      else p.segments = p.segments.filter((s) => s.id !== selected);
    });
    set({ selected: null });
  };
  const track = [
    ["video", "视频", Film],
    ["original", "原声", AudioLines],
    ["dub", "配音", Mic],
    ["subtitle", "字幕", Type],
    ["music", "音乐", Music2],
  ] as const;
  return (
    <section className="timeline-section" style={{ height }}>
      <div
        className="resize-handle"
        role="separator"
        aria-label="调整时间轴高度"
        onPointerDown={(e) => {
          const y = e.clientY,
            h = height;
          const move = (e: PointerEvent) =>
            setHeight(
              Math.max(
                220,
                Math.min(window.innerHeight * 0.6, h + y - e.clientY),
              ),
            );
          const up = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
          };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", up);
        }}
      />
      <div className="timeline-toolbar">
        <strong>时间轴</strong>
        <span className="divider" />
        <button
          onClick={split}
          disabled={!!busy || !p.videos.length}
          title="在播放头分割 S"
        >
          <Scissors size={15} />
          分割
        </button>
        <button
          onClick={del}
          disabled={!!busy || !selected}
          title="删除选中片段"
        >
          <Trash2 size={15} />
          删除
        </button>
        <button
          className={snap ? "active-toggle" : ""}
          onClick={() => setSnap(!snap)}
          title="吸附"
        >
          <Magnet size={15} />
        </button>
        <div className="spacer" />
        <span className="meta">{timecode(duration(p))}</span>
        <button
          className="icon"
          aria-label="缩小时间轴"
          onClick={() => setZoom(Math.max(20, zoom - 20))}
        >
          <Minus size={16} />
        </button>
        <input
          aria-label="时间轴缩放"
          type="range"
          min="20"
          max="240"
          value={zoom}
          onChange={(e) => setZoom(+e.target.value)}
        />
        <button
          className="icon"
          aria-label="放大时间轴"
          onClick={() => setZoom(Math.min(240, zoom + 20))}
        >
          <Plus size={16} />
        </button>
      </div>
      <div className="timeline-body">
        <div className="track-labels" ref={labelsRef}>
          <div className="track-ruler">轨道</div>
          {track.map(([id, label, Icon]) => (
            <div className={"track-label " + id} key={id}>
              <Icon size={15} />
              <span>{label}</span>
              {id !== "video" && (
                <button
                  className="icon small"
                  title={"切换" + label}
                  onClick={() =>
                    edit((p) => {
                      if (id === "original")
                        p.originalMode =
                          p.originalMode === "mute" ? "replace" : "mute";
                      if (id === "dub") p.dubVolume = p.dubVolume ? 0 : 1;
                      if (id === "subtitle") p.subtitles = !p.subtitles;
                      if (id === "music")
                        p.musicVolume = p.musicVolume ? 0 : 0.25;
                    })
                  }
                >
                  {(id === "original" && p.originalMode === "mute") ||
                  (id === "dub" && !p.dubVolume) ||
                  (id === "subtitle" && !p.subtitles) ||
                  (id === "music" && !p.musicVolume) ? (
                    <VolumeX size={13} />
                  ) : (
                    <Volume2 size={13} />
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="timeline-canvas">
          <Timeline
            ref={ref}
            editorData={rows}
            effects={{
              video: { id: "video", name: "video" },
              original: { id: "original", name: "original" },
              dub: { id: "dub", name: "dub" },
              subtitle: { id: "subtitle", name: "subtitle" },
              music: { id: "music", name: "music" },
            }}
            scale={5}
            scaleWidth={zoom}
            scaleSplitCount={5}
            startLeft={12}
            rowHeight={42}
            minScaleCount={Math.ceil(duration(p) / 5) + 6}
            style={{ width: "100%", height: "100%" }}
            gridSnap={snap}
            dragLine={snap}
            disableDrag={!!busy}
            autoScroll
            autoReRender={false}
            onScroll={({ scrollTop }) => {
              labelsRef.current
                ?.querySelectorAll<HTMLElement>(".track-label")
                .forEach((el) => {
                  el.style.transform = "translateY(-" + scrollTop + "px)";
                });
            }}
            onClickTimeArea={(t) => {
              set({
                time: Math.min(duration(p), Math.max(0, t)),
                playing: false,
              });
              return true;
            }}
            onCursorDrag={(t) =>
              set({
                time: Math.min(duration(p), Math.max(0, t)),
                playing: false,
              })
            }
            onClickActionOnly={(e, v) => {
              e.stopPropagation();
              select(v.action.id);
            }}
            onActionMoveStart={({ action }) => select(action.id)}
            onActionResizeStart={({ action }) => select(action.id)}
            onActionMoveEnd={(v) => modify(v.action.id, v.start, v.end, "move")}
            onActionMoving={({ start }) => start >= 0}
            onActionResizing={({ action, start, end }) => {
              const c =
                p.videos.find((v) => v.id === action.id) ||
                p.music.find((v) => v.id === action.id);
              if (!c)
                return (
                  /^(d|s):/.test(action.id) &&
                  start >= 0 && end <= duration(p) && end - start >= 0.04
                );
              const asset = p.assets.find((a) => a.id === c.assetId)!;
              return (
                start >= 0 &&
                end - start >= 0.04 &&
                c.in + start - c.start >= -0.0001 &&
                c.in + end - c.start <= asset.duration + 0.0001
              );
            }}
            onActionResizeEnd={(v) =>
              modify(v.action.id, v.start, v.end, "trim")
            }
            getScaleRender={(s) => <span>{timecode(s)}</span>}
            getActionRender={(action, row) => {
              const id = action.id.replace(/^[dso]:/, ""),
                s = p.segments.find((s) => s.id === id),
                v =
                  p.videos.find((v) => v.id === id) ||
                  p.music.find((v) => v.id === id),
                a = v && p.assets.find((a) => a.id === v.assetId);
              const label = s
                ? row.id === "subtitle"
                  ? s.subtitle
                  : s.text
                : a?.name || "";
              return (
                <div
                  className={
                    "clip-block " +
                    row.id +
                    (selected === id ? " selected" : "") +
                    (s && !takeFor(s) && row.id === "dub" ? " pending" : "")
                  }
                  title={label}
                >
                  {row.id === "video" && a?.thumbnail && (
                    <img alt="" src={a.thumbnail} />
                  )}
                  <span>{label}</span>
                  {row.id === "original" && a?.peaks && (
                    <svg
                      viewBox="0 0 160 24"
                      preserveAspectRatio="none"
                      className="waveform"
                    >
                      {a.peaks.map((h, i) => (
                        <path
                          key={i}
                          d={
                            "M " +
                            i +
                            " " +
                            (12 - h * 10) +
                            " V " +
                            (12 + h * 10)
                          }
                        />
                      ))}
                    </svg>
                  )}
                </div>
              );
            }}
          />
        </div>
      </div>
    </section>
  );
}
