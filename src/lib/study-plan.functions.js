import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  assignScheduledDays,
  MAX_DAILY_CAP_MINUTES,
  MAX_TARGET_DAYS,
  MIN_DAILY_CAP_MINUTES,
  packByDailyCap,
  scaleForSpeed,
} from "./study-plan";
const schema = z.object({
  courseId: z.string().uuid(),
  targetDays: z.number().int().min(1).max(MAX_TARGET_DAYS).nullable(),
  dailyCapMinutes: z
    .number()
    .int()
    .min(MIN_DAILY_CAP_MINUTES)
    .max(MAX_DAILY_CAP_MINUTES)
    .nullable()
    .optional(),
  playbackSpeed: z.number().min(0.5).max(4).optional(),
});
/**
 * Sets (or clears) the day-wise plan for an existing course.
 *
 * When `dailyCapMinutes` is given, days are packed greedily against that hard
 * watch-time cap (playlist order preserved, videos never split) and
 * `targetDays` is only stored as the user's goal. Otherwise the older
 * "balance across N days" packing is used. Clearing resets every lesson back to
 * the plain sequential list — progress is untouched.
 */
export const setCourseStudyPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => schema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const dailyCapMinutes = data.dailyCapMinutes ?? null;
    const { data: lessons, error: lessonError } = await supabase
      .from("lessons")
      .select("id, duration_seconds, position")
      .eq("course_id", data.courseId)
      .order("position", { ascending: true });
    if (lessonError) {
      console.error("study plan lessons read failed", lessonError);
      return { ok: false, error: "Could not read the lessons for this course." };
    }
    if (!lessons || lessons.length === 0) {
      return { ok: false, error: "This course has no lessons yet." };
    }
    if (data.targetDays === null && dailyCapMinutes === null) {
      const { error } = await supabase
        .from("lessons")
        .update({ scheduled_day: null })
        .eq("course_id", data.courseId);
      if (error) {
        console.error("study plan clear failed", error);
        return { ok: false, error: "Could not clear the study plan." };
      }
      await supabase
        .from("courses")
        .update({ target_days: null, daily_cap_minutes: null })
        .eq("id", data.courseId)
        .eq("user_id", userId);
      return { ok: true, days: 0 };
    }
    // Playback speed shrinks the real time each lesson costs, so pack against
    // speed-adjusted durations while the stored durations stay untouched.
    const scaled = scaleForSpeed(lessons, data.playbackSpeed ?? 1);
    const assignment = dailyCapMinutes
      ? packByDailyCap(scaled, dailyCapMinutes * 60)
      : assignScheduledDays(scaled, data.targetDays);
    const byDay = new Map();
    for (const [lessonId, day] of assignment) {
      const list = byDay.get(day) ?? [];
      list.push(lessonId);
      byDay.set(day, list);
    }
    for (const [day, ids] of byDay) {
      const { error } = await supabase.from("lessons").update({ scheduled_day: day }).in("id", ids);
      if (error) {
        console.error("study plan update failed", error);
        return { ok: false, error: "Could not save the study plan." };
      }
    }
    const { error: courseError } = await supabase
      .from("courses")
      .update({ target_days: data.targetDays, daily_cap_minutes: dailyCapMinutes })
      .eq("id", data.courseId)
      .eq("user_id", userId);
    if (courseError) {
      console.error("study plan course update failed", courseError);
    }
    return { ok: true, days: byDay.size };
  });
