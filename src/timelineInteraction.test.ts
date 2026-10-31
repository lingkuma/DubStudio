import { describe, expect, it } from "vitest";
import {
  anchoredZoom,
  maxTimelineScroll,
  dragRange,
  snapRange,
  wheelZoom,
  LinearZoomMotion,
} from "./timelineInteraction";

const range = { start: 2, end: 6 },
  bounds = { minStart: 0, maxEnd: 20 };
describe("timeline pointer geometry", () => {
  it("follows small forward and reverse pointer deltas without accumulating error", () => {
    for (const delta of [0.01, 0.02, 0.03, 0.02, 0.01, 0, -0.01, -0.02]) {
      const next = dragRange(range, delta, "move", bounds);
      expect(next.start).toBeCloseTo(2 + delta);
      expect(next.end - next.start).toBeCloseTo(4);
    }
  });
  it("clamps each edge and the whole range without losing the original pointer anchor", () => {
    expect(dragRange(range, -30, "move", bounds)).toEqual({ start: 0, end: 4 });
    expect(dragRange(range, 30, "move", bounds)).toEqual({
      start: 16,
      end: 20,
    });
    expect(dragRange(range, 30, "left", bounds)).toEqual({
      start: 5.96,
      end: 6,
    });
    expect(dragRange(range, -30, "right", bounds)).toEqual({
      start: 2,
      end: 2.04,
    });
    expect(dragRange(range, 0.1, "left", bounds)).toEqual({
      start: 2.1,
      end: 6,
    });
  });
  it("snaps to the nearest valid target regardless of target order", () => {
    expect(snapRange(range, "move", [2.04, 2.01, 2.03], 0.05, bounds)).toEqual({
      start: 2.01,
      end: 6.01,
    });
    expect(snapRange(range, "right", [6.2, 6.01, 6.03], 0.05, bounds)).toEqual({
      start: 2,
      end: 6.01,
    });
    expect(snapRange(range, "move", [-0.01, 20.01], 0.05, bounds)).toEqual(
      range,
    );
  });
});
describe("continuous wheel zoom", () => {
  it("interpolates a mouse notch linearly with the same destination at any frame rate", () => {
    const motion = new LinearZoomMotion(60);
    motion.wheel(-100, 0, 800, 1000);
    expect(motion.value(1000)).toBe(60);
    expect(motion.value(1020)).toBe(63);
    expect(motion.value(1040)).toBe(66);
    expect(motion.value(1060)).toBe(69);
    expect(motion.value(1080)).toBe(72);
    expect(motion.value(1200)).toBe(72);
    expect(motion.done(1080)).toBe(true);
  });
  it("accumulates every input even when several events arrive before a frame", () => {
    for (const interval of [0, 4, 16, 100]) {
      const motion = new LinearZoomMotion(60);
      for (let i = 0; i < 20; i++)
        motion.wheel(-2, 0, 800, 1000 + i * interval);
      expect(motion.target).toBeCloseTo(64.8);
      expect(motion.value(3000)).toBeCloseTo(64.8);
    }
  });
  it("does not lose input when reversing before the animation finishes", () => {
    const motion = new LinearZoomMotion(60);
    motion.wheel(-100, 0, 800, 1000);
    motion.wheel(100, 0, 800, 1040);
    expect(motion.value(1040)).toBe(66);
    expect(motion.value(1080)).toBe(63);
    expect(motion.value(1120)).toBe(60);
    motion.reset(240);
    motion.wheel(-100, 0, 800, 1200);
    expect(motion.value(1400)).toBe(240);
  });
  it("uses equal zoom increments for equal wheel deltas, independent of current zoom", () => {
    expect(wheelZoom(60, -10, 0, 800) - 60).toBeCloseTo(
      wheelZoom(120, -10, 0, 800) - 120,
    );
  });
  it("pins zero on zoom out when the left boundary is visible", () => {
    for (const total of [10, 180])
      for (const next of [20, 59.7]) {
        const view = anchoredZoom(60, 0, 500, next, total, 1000);
        expect(view).toEqual({ zoom: next, origin: 12, scroll: 0 });
      }
  });
  it("keeps subpixel anchors near an edge instead of snapping within a whole pixel", () => {
    for (const scroll of [0.8, maxTimelineScroll(60, 180, 1000) - 0.5]) {
      const view = anchoredZoom(60, scroll, 200, 59.99, 180, 1000);
      expect(((view.scroll + 200 - 12) * 5) / view.zoom).toBeCloseTo(
        ((scroll + 200 - 12) * 5) / 60,
        10,
      );
    }
  });
  it("pins the right edge only on zoom out and switches to left when the project fits", () => {
    for (const next of [20, 59.7]) {
      const view = anchoredZoom(
        60,
        maxTimelineScroll(60, 180, 1000),
        300,
        next,
        180,
        1000,
      );
      expect(view.scroll).toBe(maxTimelineScroll(next, 180, 1000));
      expect(view.origin).toBe(12);
    }
  });
  it("always zooms in around the pointer at the left edge, right edge and on short projects", () => {
    for (const total of [10, 180, 600])
      for (const scroll of [0, maxTimelineScroll(60, total, 1000)])
        for (const x of [40, 250, 800]) {
          const view = anchoredZoom(60, scroll, x, 120, total, 1000);
          expect(((view.scroll + x - 12) * 5) / 120).toBeCloseTo(
            ((scroll + x - 12) * 5) / 60,
            10,
          );
          expect(view.origin).toBe(12);
          if (scroll === 0) expect(view.scroll).toBeGreaterThan(0);
        }
  });
  it("keeps the pointer time in the middle and clamps at either project boundary", () => {
    for (const x of [20, 250, 800])
      for (const next of [50, 60, 80]) {
        const view = anchoredZoom(60, 1500, x, next, 600, 1000);
        expect(((view.scroll + x - 12) * 5) / next).toBeCloseTo(
          ((1500 + x - 12) * 5) / 60,
          10,
        );
      }
    expect(anchoredZoom(60, 10, 800, 20, 180, 1000).scroll).toBe(0);
    expect(anchoredZoom(60, 1150, 20, 20, 180, 1000).scroll).toBe(
      maxTimelineScroll(20, 180, 1000),
    );
  });
  it("responds proportionally to trackpad deltas and normalizes wheel units", () => {
    expect(wheelZoom(60, -1, 0, 800) - 60).toBeLessThan(1);
    expect(wheelZoom(60, -10, 0, 800)).toBeGreaterThan(
      wheelZoom(60, -1, 0, 800),
    );
    expect(wheelZoom(60, 1, 1, 800)).toEqual(wheelZoom(60, 16, 0, 800));
    expect(wheelZoom(240, -100, 0, 800)).toBe(240);
    expect(wheelZoom(20, 100, 0, 800)).toBe(20);
    expect(wheelZoom(wheelZoom(60, -100, 0, 800), 100, 0, 800)).toBeCloseTo(60);
  });
});
