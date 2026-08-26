/**
 * Duration-based day-wise study plan.
 *
 * Lessons keep their playlist order, so a day is always a *contiguous* run of
 * lessons. Splitting by video count makes days wildly uneven (3 short videos vs
 * 2 long ones), so we bin-pack by watch time instead: binary search the
 * smallest possible "max minutes per day", then greedily fill days up to it.
 */
export const MAX_TARGET_DAYS = 365;
/** Can every lesson fit into `days` bins where no bin exceeds `capacity`? */
function fitsWithin(durations, days, capacity) {
  let used = 1;
  let current = 0;
  for (const duration of durations) {
    if (current + duration <= capacity) {
      current += duration;
      continue;
    }
    used += 1;
    current = duration;
    if (used > days) return false;
  }
  return true;
}
/**
 * Assigns a 1-based day number to each lesson, keeping order and balancing the
 * total watch time of each day as evenly as possible.
 */
export function assignScheduledDays(lessons, targetDays) {
  const assignment = new Map();
  if (lessons.length === 0) return assignment;
  const days = Math.max(1, Math.min(Math.floor(targetDays), lessons.length, MAX_TARGET_DAYS));
  // Treat zero-length lessons as 1s so they never all collapse into day 1.
  const durations = lessons.map((lesson) => Math.max(1, Math.round(lesson.duration_seconds || 0)));
  if (days === 1) {
    for (const lesson of lessons) assignment.set(lesson.id, 1);
    return assignment;
  }
  let low = Math.max(...durations);
  let high = durations.reduce((sum, value) => sum + value, 0);
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (fitsWithin(durations, days, mid)) high = mid;
    else low = mid + 1;
  }
  const capacity = low;
  // Greedy fill with the optimal capacity, but never leave a day empty:
  // reserve at least one lesson for each remaining day.
  let day = 1;
  let current = 0;
  for (let index = 0; index < lessons.length; index += 1) {
    const duration = durations[index];
    const remainingLessons = lessons.length - index;
    const remainingDays = days - day;
    const mustAdvance = current > 0 && current + duration > capacity;
    const canAdvance = remainingDays > 0 && remainingLessons > remainingDays;
    if (mustAdvance && canAdvance) {
      day += 1;
      current = 0;
    }
    if (remainingLessons === remainingDays + 1 && current > 0 && remainingDays > 0) {
      // Exactly one lesson left per remaining day — advance so none stay empty.
      day += 1;
      current = 0;
    }
    assignment.set(lessons[index].id, day);
    current += duration;
  }
  return assignment;
}
/** Groups already-scheduled lessons into day buckets, ordered by day. */
export function groupByDay(lessons) {
  const buckets = new Map();
  for (const lesson of lessons) {
    if (lesson.scheduled_day == null) continue;
    const list = buckets.get(lesson.scheduled_day) ?? [];
    list.push(lesson);
    buckets.set(lesson.scheduled_day, list);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([day, items]) => ({
      day,
      lessons: items,
      totalSeconds: items.reduce((sum, lesson) => sum + (lesson.duration_seconds || 0), 0),
    }));
}
/** Preview of how a target-days value would split a playlist (import screen). */
export function planSummary(lessons, targetDays) {
  const assignment = assignScheduledDays(lessons, targetDays);
  const totals = new Map();
  for (const lesson of lessons) {
    const day = assignment.get(lesson.id);
    if (!day) continue;
    totals.set(day, (totals.get(day) ?? 0) + (lesson.duration_seconds || 0));
  }
  const values = [...totals.values()];
  if (values.length === 0) return { days: 0, averageSeconds: 0, maxSeconds: 0 };
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    days: values.length,
    averageSeconds: Math.round(sum / values.length),
    maxSeconds: Math.max(...values),
  };
}
/* ------------------------------------------------------------------ *
 * Cap-based planning: "I can watch N hours per day"
 * ------------------------------------------------------------------ */
export const MIN_DAILY_CAP_MINUTES = 5;
export const MAX_DAILY_CAP_MINUTES = 24 * 60;
/**
 * Greedy bin packing with a hard daily watch-time cap.
 *
 * Playlist order is preserved and a video is NEVER split: if adding the next
 * lesson would exceed the cap, that lesson starts the next day instead — so a
 * day can end up under the cap, but never over it. The only exception is a
 * single lesson longer than the cap: it gets its own day (otherwise it could
 * never be scheduled).
 */
export function packByDailyCap(lessons, capSeconds) {
  const assignment = new Map();
  if (lessons.length === 0) return assignment;
  const cap = Math.max(1, Math.round(capSeconds));
  let day = 1;
  let current = 0;
  for (const lesson of lessons) {
    const duration = Math.max(0, Math.round(lesson.duration_seconds || 0));
    if (current > 0 && current + duration > cap) {
      day += 1;
      current = 0;
    }
    assignment.set(lesson.id, day);
    current += duration;
  }
  return assignment;
}
/** Summary of how a daily cap would split the given lessons. */
export function summarizeCapPlan(lessons, capSeconds) {
  const cap = Math.max(1, Math.round(capSeconds));
  const assignment = packByDailyCap(lessons, cap);
  const totals = [];
  for (const lesson of lessons) {
    const day = assignment.get(lesson.id);
    if (!day) continue;
    totals[day - 1] = (totals[day - 1] ?? 0) + Math.max(0, lesson.duration_seconds || 0);
  }
  const dayTotals = totals.map((value) => value ?? 0);
  const totalSeconds = dayTotals.reduce((a, b) => a + b, 0);
  return {
    dayTotals,
    daysNeeded: dayTotals.length,
    capSeconds: cap,
    totalSeconds,
    minimumDays: Math.ceil(totalSeconds / cap),
  };
}
/** Smallest whole-minute daily cap that finishes the lessons within `days`. */
export function suggestedCapMinutes(lessons, days) {
  const target = Math.max(1, Math.floor(days));
  const longest = Math.max(1, ...lessons.map((l) => Math.max(1, l.duration_seconds || 0)));
  let low = Math.ceil(longest / 60);
  let high = Math.ceil(lessons.reduce((s, l) => s + Math.max(0, l.duration_seconds || 0), 0) / 60);
  if (high < low) high = low;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (summarizeCapPlan(lessons, mid * 60).daysNeeded <= target) high = mid;
    else low = mid + 1;
  }
  return Math.min(low, MAX_DAILY_CAP_MINUTES);
}
/* ------------------------------------------------------------------ *
 * Playback speed
 * ------------------------------------------------------------------ */
export const PLAYBACK_SPEEDS = [1, 1.25, 1.5, 1.75, 2];
/** Clamps an arbitrary value into a sane playback-speed multiplier. */
export function normalizeSpeed(value) {
  const speed = Number(value);
  if (!Number.isFinite(speed) || speed <= 0) return 1;
  return Math.min(4, Math.max(0.5, speed));
}
/**
 * Rescales lesson durations by playback speed so scheduling reflects the real
 * time the learner spends: a 60 min video at 1.5x costs 40 min of the daily cap.
 */
export function scaleForSpeed(lessons, speed) {
  const factor = normalizeSpeed(speed);
  return lessons.map((lesson) => ({
    id: lesson.id,
    duration_seconds: Math.max(0, Math.round((lesson.duration_seconds || 0) / factor)),
  }));
}
/** Calendar date for a 1-based plan day, counting from `start` inclusive. */
export function dateForDay(start, day) {
  const date = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  date.setDate(date.getDate() + Math.max(0, day - 1));
  return date;
}
/** Local-time YYYY-MM-DD key, safe for map lookups in a calendar grid. */
export function dateKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
/** Monday-first 6x7 grid of dates covering the month that contains `anchor`. */
export function monthGrid(anchor) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - offset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}
