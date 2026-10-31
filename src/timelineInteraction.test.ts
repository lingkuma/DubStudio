import { describe, expect, it } from "vitest";
import {
  anchoredZoom,
  maxTimelineScroll,
  dragRange,
  snapRange,
  wheelZoom,
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
