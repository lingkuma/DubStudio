import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
import type { TimelineAction, TimelineRow } from "@xzdarcy/timeline-engine";
import { timecode } from "./model";

export type TimelineSurfaceState = {
  setTime: (time: number) => void;
  setScrollLeft: (left: number) => void;
  getScrollLeft: () => number;
};
type Props = {
  rows: TimelineRow[];
  zoom: number;
  duration: number;
  renderAction: (action: TimelineAction, row: TimelineRow) => ReactNode;
  onSeek: (time: number) => void;
  onSelect: (id: string) => void;
  onScroll: (scroll: { scrollLeft: number; scrollTop: number }) => void;
};

// One native scroll surface: geometry, ruler and cursor share a single clock.
// Zoom never reinitializes an interaction engine or rebuilds a virtual grid.
export default forwardRef<TimelineSurfaceState, Props>(
  function TimelineSurface(props, ref) {
    const root = useRef<HTMLDivElement>(null),
      scroll = useRef<HTMLDivElement>(null);
    const content = useRef<HTMLDivElement>(null),
      ruler = useRef<HTMLCanvasElement>(null);
    const cursor = useRef<HTMLDivElement>(null),
      state = useRef(props);
    const time = useRef(0),
      logicalLeft = useRef(0),
      requestedLeft = useRef<number | null>(null);
    state.current = props;
    const paint = () => {
      const el = scroll.current,
        canvas = ruler.current,
        pointer = cursor.current;
      if (!el || !canvas || !pointer) return;
      const { zoom, duration } = state.current,
        pps = zoom / 5,
        width = el.clientWidth;
      const left = logicalLeft.current;
      pointer.style.transform = `translate3d(${12 + time.current * pps - left}px,0,0)`;
      pointer.style.visibility =
        time.current * pps + 12 - left >= 0 &&
        time.current * pps + 12 - left <= width
          ? "visible"
          : "hidden";
      const dpr = window.devicePixelRatio || 1;
      if (
        canvas.width !== Math.round(width * dpr) ||
        canvas.height !== 32 * dpr
      ) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(32 * dpr);
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, 32);
      ctx.font = "10px system-ui, sans-serif";
      ctx.textBaseline = "top";
      // Keep labels at least 64px apart without changing the time/pixel mapping.
      const choices = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
      const major = choices.find((step) => step * pps >= 64) ?? 600;
      const minor = major / 5;
      const start = Math.max(0, Math.floor((left - 12) / pps / minor));
      const end = Math.min(
        Math.ceil(duration / minor),
        Math.ceil((left + width - 12) / pps / minor),
      );
      for (let index = start; index <= end; index++) {
        const t = index * minor,
          x = 12 + t * pps - left,
          big = index % 5 === 0;
        ctx.fillStyle = big ? "#aeb9ca" : "#dce3ed";
        ctx.fillRect(x, big ? 23 : 28, 1 / dpr, big ? 8 : 3);
        if (big) {
          ctx.fillStyle = "#647188";
          ctx.fillText(timecode(t), x + 2, 8);
        }
      }
    };
    const setLeft = (left: number) => {
      const el = scroll.current;
      if (!el) return;
      logicalLeft.current = Math.max(
        0,
        Math.min(left, el.scrollWidth - el.clientWidth),
      );
      el.scrollLeft = logicalLeft.current;
      requestedLeft.current = el.scrollLeft;
      // scrollLeft is integer-rounded on some browsers. Keep its subpixel remainder
      // in the content transform so tiny trackpad deltas never accumulate drift.
      if (content.current)
        content.current.style.transform = `translateX(${el.scrollLeft - logicalLeft.current}px)`;
      paint();
    };
    useImperativeHandle(ref, () => ({
      setTime(value) {
        time.current = value;
        paint();
      },
      setScrollLeft: setLeft,
      getScrollLeft: () => logicalLeft.current,
    }));
    const resize = () => {
      const el = scroll.current;
      if (!el) return;
      const { duration, zoom } = state.current;
      if (content.current)
        content.current.style.width = `${Math.max(el.clientWidth, (duration * zoom) / 5 + 24 + el.clientWidth)}px`;
      setLeft(logicalLeft.current);
    };
    useLayoutEffect(resize, [props.zoom, props.duration]);
    useLayoutEffect(() => {
      const observer = new ResizeObserver(resize);
      observer.observe(scroll.current!);
      return () => observer.disconnect();
    }, []);
    useLayoutEffect(paint);
    const seek = (clientX: number) => {
      const el = scroll.current!;
      const t =
        ((clientX -
          el.getBoundingClientRect().left +
          logicalLeft.current -
          12) *
          5) /
        state.current.zoom;
      state.current.onSeek(Math.max(0, Math.min(state.current.duration, t)));
    };
    const scrub = (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const el = event.currentTarget;
      el.setPointerCapture(event.pointerId);
      seek(event.clientX);
      const move = (e: PointerEvent) => seek(e.clientX);
      const end = () => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("lostpointercapture", end);
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("lostpointercapture", end);
    };
    return (
      <div className="timeline-editor timeline-surface" ref={root}>
        <div className="timeline-editor-time-area" onPointerDown={scrub}>
          <canvas ref={ruler} aria-label="时间轴刻度" />
        </div>
        <div className="timeline-editor-edit-area">
          <div
            className="timeline-scroll"
            ref={scroll}
            onScroll={() => {
              const el = scroll.current!;
              if (
                requestedLeft.current === null ||
                Math.abs(el.scrollLeft - requestedLeft.current) > 0.5
              ) {
                logicalLeft.current = el.scrollLeft;
                if (content.current) content.current.style.transform = "";
              }
              requestedLeft.current = null;
              paint();
              state.current.onScroll({
                scrollLeft: logicalLeft.current,
                scrollTop: el.scrollTop,
              });
            }}
          >
            <div className="timeline-content" ref={content}>
              {props.rows.map((row) => (
                <div
                  className="timeline-editor-edit-row"
                  key={row.id}
                  style={{ height: 42 }}
                >
                  {row.actions.map((action) => (
                    <div
                      key={action.id}
                      className={
                        "timeline-editor-action" +
                        (action.movable === false
                          ? ""
                          : " timeline-editor-action-movable")
                      }
                      style={{
                        left: 12 + (action.start * props.zoom) / 5,
                        width: Math.max(
                          0.5,
                          ((action.end - action.start) * props.zoom) / 5,
                        ),
                        height: 42,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        props.onSelect(action.id);
                      }}
                    >
                      {props.renderAction(action, row)}
                      {action.flexible !== false && (
                        <>
                          <div className="timeline-editor-action-left-stretch" />
                          <div className="timeline-editor-action-right-stretch" />
                        </>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div ref={cursor} className="timeline-editor-cursor" aria-hidden="true">
          <div className="timeline-editor-cursor-area" onPointerDown={scrub}>
            <div className="timeline-editor-cursor-top" />
          </div>
        </div>
      </div>
    );
  },
);
