import { useState } from "react";

export function readPanelSize(name: string, fallback: number) {
  try {
    const value = Number(localStorage.getItem("dubstudio:layout:" + name));
    return Number.isFinite(value) && value >= 220 && value <= 1200
      ? value
      : fallback;
  } catch {
    return fallback;
  }
}
export function savePanelSize(name: string, value: number) {
  try {
    localStorage.setItem("dubstudio:layout:" + name, String(value));
  } catch {
    /* Session-only layout. */
  }
}
export function usePanelSize(name: string, fallback: number) {
  const [size, setSize] = useState(() => readPanelSize(name, fallback));
  return [
    size,
    (value: number) => {
      setSize(value);
      savePanelSize(name, value);
    },
  ] as const;
}
export default function PanelSeparator({
  side,
  size,
  resize,
}: {
  side: "left" | "right";
  size: number;
  resize: (size: number) => void;
}) {
  const constrain = (element: HTMLElement, value: number) => {
    const workspace = element.parentElement!;
    const other = workspace.querySelector(
      side === "left" ? ".right-panel" : ".transcript-panel",
    )!;
    return Math.round(
      Math.max(
        260,
        Math.min(
          value,
          workspace.clientWidth - other.getBoundingClientRect().width - 260,
        ),
      ),
    );
  };
  return (
    <div
      className={"panel-separator " + side}
      role="separator"
      tabIndex={0}
      aria-label={side === "left" ? "调整台词面板宽度" : "调整右侧面板宽度"}
      aria-orientation="vertical"
      aria-valuemin={260}
      aria-valuenow={size}
      title="拖动调整宽度，双击恢复默认；方向键微调"
      onDoubleClick={() => resize(side === "left" ? 335 : 320)}
      onKeyDown={(e) => {
        if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
        e.preventDefault();
        resize(
          constrain(
            e.currentTarget,
            size +
              (e.key === "ArrowRight" ? 20 : -20) * (side === "left" ? 1 : -1),
          ),
        );
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const element = e.currentTarget,
          workspace = element.parentElement!;
        const initial = workspace
          .querySelector(
            side === "left" ? ".transcript-panel" : ".right-panel",
          )!
          .getBoundingClientRect().width;
        const x = e.clientX;
        element.setPointerCapture(e.pointerId);
        const move = (event: PointerEvent) =>
          resize(
            constrain(
              element,
              initial + (event.clientX - x) * (side === "left" ? 1 : -1),
            ),
          );
        const end = () => {
          element.removeEventListener("pointermove", move);
          element.removeEventListener("lostpointercapture", end);
        };
        element.addEventListener("pointermove", move);
        element.addEventListener("lostpointercapture", end);
      }}
    />
  );
}
