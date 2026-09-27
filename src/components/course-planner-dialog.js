import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import {
  Calendar as CalendarIcon,
  CalendarClock,
  Clock,
  Gauge,
  Sparkles,
  Zap,
  Check,
  Target,
  ArrowRight,
  SlidersHorizontal,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDuration } from "@/lib/format";
import {
  PLAYBACK_SPEEDS,
  assignScheduledDays,
  scaleForSpeed,
  summarizeCapPlan,
  suggestedCapMinutes,
} from "@/lib/study-plan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const DURATION_PRESETS = [
  { label: "1 Month", days: 30, desc: "Fast-track intensive" },
  { label: "2 Months", days: 60, desc: "Balanced pace" },
  { label: "3 Months", days: 90, desc: "Steady & thorough" },
  { label: "6 Months", days: 180, desc: "Relaxed learning" },
];

const DAILY_TIME_PRESETS = [
  { label: "30 min", minutes: 30 },
  { label: "45 min", minutes: 45 },
  { label: "1 hr", minutes: 60 },
  { label: "1.5 hr", minutes: 90 },
  { label: "2 hr", minutes: 120 },
  { label: "3 hr", minutes: 180 },
];

export function CoursePlannerDialog({
  open,
  onOpenChange,
  course,
  lessons = [],
  progress = [],
  currentDailyTarget = 60,
  currentSpeed = 1,
  currentTargetDays = null,
  onPlanSaved,
}) {
  const [plannerMode, setPlannerMode] = useState("duration"); // "duration" | "date" | "daily"
  const [targetDays, setTargetDays] = useState(currentTargetDays || 60);
  const [dailyMinutes, setDailyMinutes] = useState(currentDailyTarget || 60);
  const [speed, setSpeed] = useState(Number(currentSpeed) || 1);
  const [targetDateStr, setTargetDateStr] = useState("");
  const [saving, setSaving] = useState(false);

  // Remaining lessons calculation
  const completedLessonIds = useMemo(() => {
    return new Set(progress.filter((p) => p.completed).map((p) => p.lesson_id));
  }, [progress]);

  const remainingLessons = useMemo(() => {
    return lessons.filter((l) => !completedLessonIds.has(l.id));
  }, [lessons, completedLessonIds]);

  const totalRawSeconds = useMemo(() => {
    return lessons.reduce((sum, l) => sum + (l.duration_seconds || 0), 0);
  }, [lessons]);

  const remainingRawSeconds = useMemo(() => {
    return remainingLessons.reduce((sum, l) => sum + (l.duration_seconds || 0), 0);
  }, [remainingLessons]);

  // Scaled for speed
  const effectiveRemainingSeconds = Math.round(remainingRawSeconds / speed);
  const timeSavedSeconds = Math.max(0, remainingRawSeconds - effectiveRemainingSeconds);

  // Initialize target date string
  useEffect(() => {
    if (open) {
      const initialDays = currentTargetDays || Math.max(7, Math.ceil(effectiveRemainingSeconds / ((currentDailyTarget || 60) * 60)));
      setTargetDays(initialDays);
      setDailyMinutes(currentDailyTarget || 60);
      setSpeed(Number(currentSpeed) || 1);

      const finishDate = new Date();
      finishDate.setDate(finishDate.getDate() + initialDays);
      setTargetDateStr(finishDate.toISOString().slice(0, 10));
    }
  }, [open, currentTargetDays, currentDailyTarget, currentSpeed, effectiveRemainingSeconds]);

  // When Target Date is changed, compute target days
  const handleDateChange = (e) => {
    const val = e.target.value;
    setTargetDateStr(val);
    if (!val) return;
    const chosen = new Date(val);
    const now = new Date();
    const diffMs = chosen.getTime() - now.getTime();
    const computedDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    setTargetDays(computedDays);
  };

  // When Target Days is changed from Duration mode, compute required daily time
  const activeDays = plannerMode === "daily"
    ? Math.max(1, Math.ceil(effectiveRemainingSeconds / (dailyMinutes * 60)))
    : targetDays;

  // Calculated daily watch time in minutes
  const calculatedDailyMins = useMemo(() => {
    if (plannerMode === "daily") return dailyMinutes;
    return Math.max(5, Math.ceil(effectiveRemainingSeconds / (Math.max(1, activeDays) * 60)));
  }, [plannerMode, dailyMinutes, effectiveRemainingSeconds, activeDays]);

  // Projected Completion Date
  const projectedFinishDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + activeDays);
    return d;
  }, [activeDays]);

  // Lessons per day estimate
  const avgLessonsPerDay = useMemo(() => {
    if (activeDays <= 0 || remainingLessons.length === 0) return 1;
    const avg = (remainingLessons.length / activeDays).toFixed(1);
    return avg.endsWith(".0") ? String(Math.round(Number(avg))) : avg;
  }, [activeDays, remainingLessons.length]);

  const handleSavePlan = async () => {
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) throw new Error("Not signed in");

      // 1. Save preferences (playback_speed and daily_target_minutes)
      await supabase.from("preferences").upsert(
        {
          user_id: auth.user.id,
          playback_speed: speed,
          daily_target_minutes: calculatedDailyMins,
        },
        { onConflict: "user_id" },
      );

      // 2. Save course target days and daily cap
      await supabase
        .from("courses")
        .update({
          target_days: activeDays,
          daily_cap_minutes: calculatedDailyMins,
        })
        .eq("id", course.id);

      // 3. Re-assign scheduled_day for lessons
      const scaledLessons = scaleForSpeed(lessons, speed);
      const scheduleMap = assignScheduledDays(scaledLessons, activeDays);

      const updates = lessons.map((l) => ({
        id: l.id,
        scheduled_day: scheduleMap.get(l.id) || 1,
      }));

      // Batch update in chunks of 50
      for (let i = 0; i < updates.length; i += 50) {
        const chunk = updates.slice(i, i + 50);
        await Promise.all(
          chunk.map((item) =>
            supabase.from("lessons").update({ scheduled_day: item.scheduled_day }).eq("id", item.id),
          ),
        );
      }

      toast.success(`Study plan updated! Target: ${activeDays} days at ${speed}x speed.`, {
        description: `Daily goal: ~${calculatedDailyMins} mins (${avgLessonsPerDay} lessons/day).`,
      });

      onPlanSaved?.({
        targetDays: activeDays,
        dailyMinutes: calculatedDailyMins,
        speed,
        finishDate: projectedFinishDate,
      });

      onOpenChange(false);
    } catch (err) {
      toast.error(err.message || "Failed to save study plan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
            <CalendarClock className="size-5 text-primary" />
            Course Study Planner & Pacing
          </DialogTitle>
          <DialogDescription>
            Divide this course into daily/monthly targets based on your available time and preferred speed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Target Planning Mode Tabs */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-foreground">How do you want to plan?</Label>
            <Tabs value={plannerMode} onValueChange={setPlannerMode} className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="duration" className="text-xs">
                  Target Months / Days
                </TabsTrigger>
                <TabsTrigger value="date" className="text-xs">
                  Target End Date
                </TabsTrigger>
                <TabsTrigger value="daily" className="text-xs">
                  Daily Study Time
                </TabsTrigger>
              </TabsList>

              {/* Duration (Months/Days) Mode */}
              <TabsContent value="duration" className="space-y-3 mt-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {DURATION_PRESETS.map((preset) => (
                    <button
                      key={preset.days}
                      type="button"
                      onClick={() => setTargetDays(preset.days)}
                      className={`flex flex-col items-center justify-center p-2.5 rounded-lg border text-center transition ${
                        targetDays === preset.days
                          ? "border-primary bg-primary/10 text-primary font-semibold shadow-sm"
                          : "border-border bg-surface hover:bg-elevated/40 text-foreground"
                      }`}
                    >
                      <span className="text-sm font-medium">{preset.label}</span>
                      <span className="text-[10px] text-muted-foreground mt-0.5">{preset.days} Days</span>
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <Label htmlFor="custom-days" className="text-xs shrink-0">
                    Custom Days:
                  </Label>
                  <Input
                    id="custom-days"
                    type="number"
                    min={1}
                    max={365}
                    value={targetDays}
                    onChange={(e) => setTargetDays(Math.max(1, Number(e.target.value)))}
                    className="h-8 w-28 text-xs font-mono"
                  />
                  <span className="text-xs text-muted-foreground">
                    (~{(targetDays / 30).toFixed(1)} months)
                  </span>
                </div>
              </TabsContent>

              {/* End Date Mode */}
              <TabsContent value="date" className="space-y-3 mt-3">
                <div className="space-y-1.5">
                  <Label htmlFor="target-date" className="text-xs">
                    Choose Target Completion Date:
                  </Label>
                  <Input
                    id="target-date"
                    type="date"
                    value={targetDateStr}
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={handleDateChange}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="rounded-md bg-surface p-2.5 text-xs text-muted-foreground">
                  Target Duration: <strong className="text-foreground">{targetDays} Days</strong> from today.
                </div>
              </TabsContent>

              {/* Daily Study Time Mode */}
              <TabsContent value="daily" className="space-y-3 mt-3">
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                  {DAILY_TIME_PRESETS.map((preset) => (
                    <button
                      key={preset.minutes}
                      type="button"
                      onClick={() => setDailyMinutes(preset.minutes)}
                      className={`p-2 rounded-lg border text-center transition text-xs ${
                        dailyMinutes === preset.minutes
                          ? "border-primary bg-primary/10 text-primary font-semibold shadow-sm"
                          : "border-border bg-surface hover:bg-elevated/40 text-foreground"
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <Label htmlFor="custom-mins" className="text-xs shrink-0">
                    Custom Minutes/Day:
                  </Label>
                  <Input
                    id="custom-mins"
                    type="number"
                    min={5}
                    max={360}
                    step={5}
                    value={dailyMinutes}
                    onChange={(e) => setDailyMinutes(Math.max(5, Number(e.target.value)))}
                    className="h-8 w-28 text-xs font-mono"
                  />
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Preferred Playback Speed Selector */}
          <div className="space-y-2 rounded-lg border border-border bg-surface/80 p-3.5">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Zap className="size-3.5 text-amber-400" />
                Default Video Playback Speed
              </Label>
              <Badge variant="secondary" className="text-[10px] font-mono">
                {speed}x Speed
              </Badge>
            </div>

            <p className="text-[11px] text-muted-foreground">
              All lesson videos in this course will play at this speed by default.
            </p>

            <div className="flex gap-1.5 pt-1">
              {PLAYBACK_SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSpeed(s)}
                  className={`flex-1 py-1.5 rounded-md border text-center font-mono text-xs transition ${
                    speed === s
                      ? "border-primary bg-primary text-primary-foreground font-semibold shadow-sm"
                      : "border-border bg-elevated/40 hover:bg-elevated text-foreground"
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>

            {speed > 1 && timeSavedSeconds > 0 ? (
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 pt-1">
                <Sparkles className="size-3" />
                <span>
                  At {speed}x speed, you save <strong>{formatDuration(timeSavedSeconds)}</strong> of total watch time!
                </span>
              </div>
            ) : null}
          </div>

          {/* Real-time Schedule Breakdown Card */}
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
            <div className="flex items-center gap-2 font-medium text-xs text-primary uppercase tracking-wider">
              <Target className="size-3.5" />
              Your Personalized Study Schedule
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="rounded-md bg-surface/90 p-2.5 space-y-0.5 border border-border">
                <span className="text-[10px] text-muted-foreground">Target Duration</span>
                <p className="font-semibold text-foreground">{activeDays} Days</p>
                <span className="text-[10px] text-muted-foreground">
                  (~{Math.ceil(activeDays / 30)} {Math.ceil(activeDays / 30) === 1 ? "month" : "months"})
                </span>
              </div>

              <div className="rounded-md bg-surface/90 p-2.5 space-y-0.5 border border-border">
                <span className="text-[10px] text-muted-foreground">Daily Commitment</span>
                <p className="font-semibold text-primary">~{calculatedDailyMins} min/day</p>
                <span className="text-[10px] text-muted-foreground">effective watch time</span>
              </div>

              <div className="rounded-md bg-surface/90 p-2.5 space-y-0.5 border border-border">
                <span className="text-[10px] text-muted-foreground">Lessons / Day</span>
                <p className="font-semibold text-foreground">~{avgLessonsPerDay} lessons</p>
                <span className="text-[10px] text-muted-foreground">
                  {remainingLessons.length} remaining
                </span>
              </div>

              <div className="rounded-md bg-surface/90 p-2.5 space-y-0.5 border border-border">
                <span className="text-[10px] text-muted-foreground">Completion Date</span>
                <p className="font-semibold text-emerald-400">
                  {projectedFinishDate.toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
                <span className="text-[10px] text-muted-foreground">staying on track</span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSavePlan} disabled={saving} className="gap-1.5 font-medium">
            <Check className="size-3.5" />
            {saving ? "Saving Schedule..." : "Apply & Save Study Plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
