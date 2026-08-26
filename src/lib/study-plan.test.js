import { describe, expect, it } from "vitest";
import { packByDailyCap, summarizeCapPlan, suggestedCapMinutes } from "./study-plan";
const min = (m) => m * 60;
describe("packByDailyCap", () => {
  it("never exceeds the daily cap and never splits a video (worked example)", () => {
    // Day 3 accumulates 1h48m (108m), the next video is 25m: 133m > 120m cap,
    // so that video must open Day 4 and Day 3 stays at 108m.
    const lessons = [
      { id: "d1a", duration_seconds: min(120) }, // Day 1 = 120m exactly
      { id: "d2a", duration_seconds: min(120) }, // Day 2 = 120m exactly
      { id: "d3a", duration_seconds: min(60) },
      { id: "d3b", duration_seconds: min(48) }, // Day 3 = 108m
      { id: "d4a", duration_seconds: min(25) }, // does not fit -> Day 4
    ];
    const plan = packByDailyCap(lessons, min(120));
    expect(plan.get("d3a")).toBe(3);
    expect(plan.get("d3b")).toBe(3);
    expect(plan.get("d4a")).toBe(4);
    const summary = summarizeCapPlan(lessons, min(120));
    expect(summary.daysNeeded).toBe(4);
    expect(summary.dayTotals[2]).toBe(min(108));
    expect(summary.dayTotals.every((total) => total <= min(120))).toBe(true);
  });
  it("keeps playlist order and gives an over-long lesson its own day", () => {
    const lessons = [
      { id: "a", duration_seconds: min(30) },
      { id: "b", duration_seconds: min(200) },
      { id: "c", duration_seconds: min(10) },
    ];
    const plan = packByDailyCap(lessons, min(120));
    expect([plan.get("a"), plan.get("b"), plan.get("c")]).toEqual([1, 2, 3]);
  });
  it("suggests a cap that fits the target days", () => {
    const lessons = Array.from({ length: 10 }, (_, i) => ({
      id: `l${i}`,
      duration_seconds: min(30),
    }));
    const cap = suggestedCapMinutes(lessons, 5);
    expect(summarizeCapPlan(lessons, cap * 60).daysNeeded).toBeLessThanOrEqual(5);
  });
});
