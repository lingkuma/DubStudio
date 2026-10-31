import { readPanelSize, savePanelSize } from "./PanelSeparator";
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import TimelineSurface, { type TimelineSurfaceState } from "./TimelineSurface";
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
import {
  dragRange,
  anchoredZoom,
  snapRange,
  LinearZoomMotion,
  type DragKind,
} from "./timelineInteraction";
function EditorTimeline() {
  const p = useStudio((s) => s.project),
    selected = useStudio((s) => s.selected),
    busy = useStudio((s) => s.busy),
    edit = useStudio((s) => s.edit),
    set = useStudio((s) => s.set),
    ref = useRef<TimelineSurfaceState>(null),
    [viewport, setViewport] = useState({ zoom: 60, origin: 12 }),
    [snap, setSnap] = useState(true),
    [height, setHeight] = useState(() =>
      Math.min(readPanelSize("timeline", 300), window.innerHeight * 0.6),
    );
  useEffect(() => {
    savePanelSize("timeline", height);
  }, [height]);
  const labelsRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const scrollLeftRef = useRef(0);
  const zoomMotion = useRef(new LinearZoomMotion(60));
  const zoomFrame = useRef(0);
  const zoomAnchor = useRef(0);
  const pendingScroll = useRef<number | null>(null);
  const dragged = useRef(false);
  const interaction = useRef<{ cancel: () => void } | null>(null);
  const { zoom, origin } = viewport;
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const [viewportWidth, setViewportWidth] = useState(1600);
  const total = useMemo(() => duration(p), [p]);
  const geometryRef = useRef({ total, width: viewportWidth });
  geometryRef.current = { total, width: viewportWidth };
  const paintZoom = (next: number, x: number) => {
    const current = viewportRef.current;
    if (Math.abs(next - current.zoom) < 0.000001) return;
    const view = anchoredZoom(
      current.zoom,
      ref.current?.getScrollLeft() ?? scrollLeftRef.current,
      x,
      next,
      geometryRef.current.total,
      geometryRef.current.width,
    );
    pendingScroll.current = view.scroll;
    viewportRef.current = { zoom: view.zoom, origin: view.origin };
    flushSync(() => setViewport(viewportRef.current));
  };
  const tickZoom = (now: number) => {
    zoomFrame.current = 0;
    paintZoom(zoomMotion.current.value(now), zoomAnchor.current);
    if (!zoomMotion.current.done(now))
      zoomFrame.current = requestAnimationFrame(tickZoom);
  };
  const changeZoom = (value: number) => {
    if (interaction.current) return;
    cancelAnimationFrame(zoomFrame.current);
    zoomFrame.current = 0;
    zoomMotion.current.reset(value);
    paintZoom(value, geometryRef.current.width / 2);
  };
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const canvas = section.querySelector<HTMLElement>(".timeline-canvas");
    const scroll = canvas?.querySelector<HTMLElement>(".timeline-scroll");
    const resize = new ResizeObserver(() => {
      if (scroll) setViewportWidth(scroll.clientWidth);
    });
    if (scroll) resize.observe(scroll);
    const zoomOnWheel = (event: WheelEvent) => {
      if (!event.ctrlKey || event.deltaY === 0) return;
      event.preventDefault();
      event.stopPropagation();
      if (interaction.current || !canvas) return;
      zoomAnchor.current = Math.max(
        0,
        Math.min(
          scroll?.clientWidth ?? canvas.clientWidth,
          event.clientX - canvas.getBoundingClientRect().left,
        ),
      );
      zoomMotion.current.wheel(
        event.deltaY,
        event.deltaMode,
        section.clientHeight,
        performance.now(),
      );
      // Coalesce the input stream into one atomic geometry update per frame.
      if (!zoomFrame.current)
        zoomFrame.current = requestAnimationFrame(tickZoom);
    };
    section.addEventListener("wheel", zoomOnWheel, {
      passive: false,
      capture: true,
    });
    return () => {
      section.removeEventListener("wheel", zoomOnWheel, true);
      resize.disconnect();
      cancelAnimationFrame(zoomFrame.current);
      interaction.current?.cancel();
    };
  }, []);
  useLayoutEffect(() => {
    const left = pendingScroll.current;
    if (left === null) return;
    scrollLeftRef.current = left;
    ref.current?.setScrollLeft(left);
    pendingScroll.current = null;
  }, [viewport]);
  const segments = useMemo(() => activeSegments(p), [p]);
  const items = useMemo(() => {
    const assets = new Map(p.assets.map((a) => [a.id, a]));
    return new Map<
      string,
      {
        text: string;
        subtitle?: string;
        pending?: boolean;
        thumbnail?: string;
        waveform?: string;
      }
    >([
      ...segments.map(
        (s) =>
          [
            s.id,
            {
              text: s.text,
              subtitle: s.subtitle,
              pending: !takeFor(s),
            },
          ] as const,
      ),
      ...[...p.videos, ...p.music].map((v) => {
        const a = assets.get(v.assetId);
        return [
          v.id,
          {
            text: a?.name || "",
            thumbnail: a?.thumbnail,
            waveform: a?.peaks
              ?.map((h, i) => `M ${i} ${12 - h * 10} V ${12 + h * 10}`)
              .join(" "),
          },
        ] as const;
      }),
    ]);
  }, [p, segments]);
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
        actions: segments.map((s) => {
          const at = placement(p, s)!,
            dub = dubPlacement(p, s);
          return {
            id: "d:" + s.id,
            start: dub?.start ?? Math.max(0, at.start + s.dubOffset),
            end: dub?.end ?? at.end + s.dubOffset,
            effectId: "dub",
            maxEnd: total,
          };
        }),
      },
      {
        id: "subtitle",
        actions: segments.map((s) => {
          const at = subtitlePlacement(p, s)!;
          return {
            id: "s:" + s.id,
            start: at.start,
            end: at.end,
            effectId: "subtitle",
            maxEnd: total,
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
    [p, segments, total],
  );
  useEffect(() => {
    ref.current?.setTime(useStudio.getState().time);
    return useStudio.subscribe((state, previous) => {
      if (state.time !== previous.time) ref.current?.setTime(state.time);
    });
  }, []);
  const select = (id: string) => {
    const next = id.replace(/^[dso]:/, "");
    if (useStudio.getState().selected !== next) set({ selected: next });
  };
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
        const current =
          track === "dub"
            ? (dubPlacement(p, s) ?? {
                start: Math.max(0, at.start + s.dubOffset),
              })
            : subtitlePlacement(p, s)!;
        if (track === "dub") s.dubOffset += start - current.start;
        else s.subtitleOffset += start - current.start;
      }
    });
  };
  const beginDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    cancelAnimationFrame(zoomFrame.current);
    zoomFrame.current = 0;
    zoomMotion.current.reset(viewportRef.current.zoom);
    dragged.current = false;
    if (event.button !== 0 || busy || interaction.current) return;
    const target = event.target as Element;
    const element = target.closest<HTMLElement>(".timeline-editor-action");
    const grid = element?.closest<HTMLElement>(".timeline-scroll");
    const area = element?.closest<HTMLElement>(".timeline-editor-edit-area");
    if (
      !element ||
      !grid ||
      !area ||
      !element.classList.contains("timeline-editor-action-movable")
    )
      return;
    const id =
      element.querySelector<HTMLElement>(".clip-block")?.dataset.actionId;
    const action = rows.flatMap((r) => r.actions).find((a) => a.id === id);
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    pendingScroll.current = null;
    const kind: DragKind = target.closest(
      ".timeline-editor-action-left-stretch",
    )
      ? "left"
      : target.closest(".timeline-editor-action-right-stretch")
        ? "right"
        : "move";
    const original = { start: action.start, end: action.end };
    const clip =
      p.videos.find((v) => v.id === action.id) ||
      p.music.find((v) => v.id === action.id);
    const asset = clip && p.assets.find((a) => a.id === clip.assetId);
    const bounds =
      clip && asset && kind !== "move"
        ? {
            minStart: Math.max(0, clip.start - clip.in),
            maxEnd: clip.start + asset.duration - clip.in,
          }
        : { minStart: 0, maxEnd: clip ? Infinity : total };
    const targets = rows.flatMap((r) =>
      r.actions
        .filter((a) => a.id !== action.id)
        .flatMap((a) => [a.start, a.end]),
    );
    targets.push(useStudio.getState().time);
    const startX = event.clientX,
      initialScroll = grid.scrollLeft,
      pixelsPerSecond = zoom / 5;
    const pointerId = event.pointerId;
    let x = startX,
      frame = 0,
      active = false,
      previous = performance.now();
    let range = original;
    const originLeft = origin + original.start * pixelsPerSecond;
    const paint = () => {
      range = dragRange(
        original,
        (x - startX + grid.scrollLeft - initialScroll) / pixelsPerSecond,
        kind,
        bounds,
      );
      if (kind === "move")
        element.style.transform = `translate3d(${(range.start - original.start) * pixelsPerSecond}px,0,0)`;
      else {
        element.style.left = `${origin + range.start * pixelsPerSecond}px`;
        element.style.width = `${(range.end - range.start) * pixelsPerSecond}px`;
      }
    };
    const tick = (now: number) => {
      frame = 0;
      const rect = grid.getBoundingClientRect(),
        dt = Math.min(32, now - previous);
      previous = now;
      const outside =
        x < rect.left + 20
          ? x - rect.left - 20
          : x > rect.right - 20
            ? x - rect.right + 20
            : 0;
      if (outside)
        grid.scrollLeft +=
          (Math.max(-600, Math.min(600, outside * 8)) * dt) / 1000;
      paint();
      if (outside) frame = requestAnimationFrame(tick);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      e.preventDefault();
      e.stopPropagation();
      x = e.clientX;
      if (!active && Math.abs(x - startX) < 2) return;
      active = true;
      dragged.current = true;
      element.classList.add("pointer-dragging");
      if (!frame) {
        previous = performance.now();
        frame = requestAnimationFrame(tick);
      }
    };
    const finish = (commit: boolean) => {
      if (useStudio.getState().project !== p) commit = false;
      cancelAnimationFrame(frame);
      if (active) paint();
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", cancel, true);
      window.removeEventListener("blur", cancel);
      element.classList.remove("pointer-dragging");
      element.style.transform = "";
      if (commit && active) {
        if (snap)
          range = snapRange(range, kind, targets, 5 / pixelsPerSecond, bounds);
        element.style.left = `${origin + range.start * pixelsPerSecond}px`;
        element.style.width = `${(range.end - range.start) * pixelsPerSecond}px`;
        if (
          Math.abs(range.start - original.start) +
            Math.abs(range.end - original.end) >
          0.000001
        )
          modify(
            action.id,
            range.start,
            range.end,
            kind === "move" ? "move" : "trim",
          );
      } else {
        element.style.left = `${originLeft}px`;
        element.style.width = `${(original.end - original.start) * pixelsPerSecond}px`;
      }
      interaction.current = null;
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      x = e.clientX;
      e.stopPropagation();
      finish(true);
    };
    const cancel = () => finish(false);
    interaction.current = { cancel };
    select(action.id);
    window.addEventListener("pointermove", move, {
      capture: true,
      passive: false,
    });
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", cancel, true);
    window.addEventListener("blur", cancel);
  };
  const split = () => {
    const time = useStudio.getState().time;
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
    <section className="timeline-section" ref={sectionRef} style={{ height }}>
      <div
        className="resize-handle"
        role="separator"
        aria-label="调整时间轴高度"
        aria-orientation="horizontal"
        aria-valuenow={Math.round(height)}
        tabIndex={0}
        onDoubleClick={() => setHeight(300)}
        onKeyDown={(e) => {
          if (!["ArrowUp", "ArrowDown"].includes(e.key)) return;
          e.preventDefault();
          setHeight(
            Math.max(
              220,
              Math.min(
                window.innerHeight * 0.6,
                height + (e.key === "ArrowUp" ? 20 : -20),
              ),
            ),
          );
        }}
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
            window.removeEventListener("pointercancel", up);
          };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", up);
          window.addEventListener("pointercancel", up);
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
          title="松开时吸附片段端点"
        >
          <Magnet size={15} />
        </button>
        <div className="spacer" />
        <span className="meta">{timecode(total)}</span>
        <button
          className="icon"
          aria-label="缩小时间轴"
          onClick={() => changeZoom(Math.max(20, zoom - 20))}
        >
          <Minus size={16} />
        </button>
        <input
          aria-label="时间轴缩放"
          title="Ctrl + 滚轮缩放时间轴"
          type="range"
          min="20"
          max="240"
          step="any"
          value={zoom}
          onChange={(e) => changeZoom(+e.target.value)}
        />
        <button
          className="icon"
          aria-label="放大时间轴"
          onClick={() => changeZoom(Math.min(240, zoom + 20))}
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
        <div
          className="timeline-canvas"
          onPointerDownCapture={beginDrag}
          onClick={(event) => {
            const target = event.target as Element;
            if (
              dragged.current ||
              !target.closest(".timeline-editor-edit-area") ||
              target.closest(".timeline-editor-action, .timeline-editor-cursor")
            )
              return;
            const grid = event.currentTarget.querySelector<HTMLElement>(
              ".timeline-editor-edit-area .timeline-scroll",
            );
            if (!grid) return;
            const bounds = grid.getBoundingClientRect();
            // Ignore the scrollbar itself, including the overlay scrollbar.
            if (
              event.clientY >= bounds.bottom - 4 ||
              event.clientX >= bounds.left + grid.clientWidth
            )
              return;
            const at =
              ((event.clientX -
                bounds.left +
                (ref.current?.getScrollLeft() ?? grid.scrollLeft) -
                origin) *
                5) /
              zoom;
            set({ time: Math.min(total, Math.max(0, at)), playing: false });
          }}
        >
          <TimelineSurface
            ref={ref}
            rows={rows}
            zoom={zoom}
            duration={total}
            onScroll={({ scrollTop, scrollLeft }) => {
              scrollLeftRef.current = scrollLeft;
              labelsRef.current
                ?.querySelectorAll<HTMLElement>(".track-label")
                .forEach((el) => {
                  el.style.transform = "translateY(-" + scrollTop + "px)";
                });
            }}
            onSeek={(t) => set({ time: t, playing: false })}
            onSelect={select}
            renderAction={(action, row) => {
              const id = action.id.replace(/^[dso]:/, ""),
                item = items.get(id);
              return (
                <ClipBlock
                  actionId={action.id}
                  track={row.id}
                  label={
                    (row.id === "subtitle" ? item?.subtitle : item?.text) || ""
                  }
                  selected={selected === id}
                  pending={!!item?.pending}
                  thumbnail={item?.thumbnail}
                  waveform={item?.waveform}
                />
              );
            }}
          />
        </div>
      </div>
    </section>
  );
}
const ClipBlock = memo(function ClipBlock({
  actionId,
  track,
  label,
  selected,
  pending,
  thumbnail,
  waveform,
}: {
  actionId: string;
  track: string;
  label: string;
  selected: boolean;
  pending: boolean;
  thumbnail?: string;
  waveform?: string;
}) {
  return (
    <div
      data-action-id={actionId}
      className={`clip-block ${track}${selected ? " selected" : ""}${pending && track === "dub" ? " pending" : ""}`}
      title={label}
    >
      {track === "video" && thumbnail && <img alt="" src={thumbnail} />}
      <span>{label}</span>
      {track === "original" && waveform && (
        <svg
          viewBox="0 0 160 24"
          preserveAspectRatio="none"
          className="waveform"
        >
          <path d={waveform} />
        </svg>
      )}
    </div>
  );
});
export default memo(EditorTimeline);
