import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flame,
  Gauge,
  List,
  Loader2,
  PlayCircle,
  Search,
  Trophy,
  Youtube,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { computeCourseStats, estimatedCompletionDate } from "@/lib/course";
import {
  dateForDay,
  dateKey,
  groupByDay,
  MAX_DAILY_CAP_MINUTES,
  MAX_TARGET_DAYS,
  MIN_DAILY_CAP_MINUTES,
  monthGrid,
  normalizeSpeed,
  PLAYBACK_SPEEDS,
  scaleForSpeed,
  suggestedCapMinutes,
  summarizeCapPlan,
} from "@/lib/study-plan";
import { setCourseStudyPlan } from "@/lib/study-plan.functions";
import { formatDuration } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
export const Route = createFileRoute("/_authenticated/course/$courseId/")({
  head: () => ({
    meta: [
      { title: "Course sheet — CodeStudy" },
      {
        name: "description",
        content:
          "Day-wise study sheet for your imported YouTube course: collapsible days, a study calendar, playback-speed aware watch-time caps and lesson progress.",
      },
      { property: "og:title", content: "Course sheet — CodeStudy" },
      {
        property: "og:description",
        content: "Track your day-wise study plan, calendar and lesson progress.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CoursePage,
});
/** Thin TUF-style progress bar drawn with the study-sheet tokens. */
function SheetProgress({ value, className }) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-full bg-sheet-muted", className)}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500",
          clamped === 100 ? "bg-sheet-success" : "bg-sheet-accent",
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
function DoneToggle({ done, onToggle }) {
  return (
    <button
      type="button"
      aria-label={done ? "Mark as not completed" : "Mark as completed"}
      aria-pressed={done}
      onClick={onToggle}
      className={cn(
        "grid size-5 shrink-0 place-items-center rounded-[5px] border transition-colors",
        done
          ? "border-sheet-success bg-sheet-success text-sheet-accent-foreground"
          : "border-sheet-border bg-sheet-card hover:border-sheet-accent",
      )}
    >
      {done ? <Check className="size-3.5" strokeWidth={3} /> : null}
    </button>
  );
}
function StatTile({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg border border-sheet-border bg-sheet-card px-3 py-2.5">
      <p className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-sheet-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}
function formatHours(minutes) {
  const value = minutes / 60;
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}
function formatSpeed(speed) {
  return `${Number.isInteger(speed) ? speed : speed}x`;
}
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function CoursePage() {
  const { courseId } = Route.useParams();
  const queryClient = useQueryClient();
  const savePlan = useServerFn(setCourseStudyPlan);
  const query = useQuery({
    queryKey: ["course", courseId],
    queryFn: async () => {
      const [course, lessons, progress, prefs] = await Promise.all([
        supabase.from("courses").select("*").eq("id", courseId).maybeSingle(),
        supabase
          .from("lessons")
          .select("id, title, position, duration_seconds, scheduled_day, thumbnail_url")
          .eq("course_id", courseId)
          .order("position", { ascending: true }),
        supabase
          .from("lesson_progress")
          .select("lesson_id, completed, watched_seconds, last_position")
          .eq("course_id", courseId),
        supabase.from("preferences").select("daily_target_minutes, playback_speed").maybeSingle(),
      ]);
      if (!course.data) throw notFound();
      return {
        course: course.data,
        lessons: lessons.data ?? [],
        progress: progress.data ?? [],
        prefs: prefs.data,
      };
    },
  });
  const toggleComplete = useMutation({
    mutationFn: async ({ lessonId, completed }) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");
      const lesson = query.data?.lessons.find((l) => l.id === lessonId);
      const { error } = await supabase.from("lesson_progress").upsert(
        {
          user_id: auth.user.id,
          lesson_id: lessonId,
          course_id: courseId,
          completed,
          completed_at: completed ? new Date().toISOString() : null,
          duration_seconds: lesson?.duration_seconds ?? 0,
          watched_seconds: completed ? (lesson?.duration_seconds ?? 0) : 0,
          last_watched_at: new Date().toISOString(),
        },
        { onConflict: "user_id,lesson_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["course", courseId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: () => toast.error("Could not update that lesson"),
  });
  /** Marks/unmarks every lesson of one plan day in a single round trip. */
  const toggleDayComplete = useMutation({
    mutationFn: async ({ lessons, completed }) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");
      const now = new Date().toISOString();
      const { error } = await supabase.from("lesson_progress").upsert(
        lessons.map((lesson) => ({
          user_id: auth.user.id,
          lesson_id: lesson.id,
          course_id: courseId,
          completed,
          completed_at: completed ? now : null,
          duration_seconds: lesson.duration_seconds,
          watched_seconds: completed ? lesson.duration_seconds : 0,
          last_watched_at: now,
        })),
        { onConflict: "user_id,lesson_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["course", courseId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: () => toast.error("Could not update that day"),
  });
  const planMutation = useMutation({
    mutationFn: async (input) => {
      // Keep the learner's chosen speed as their default for ETA maths elsewhere.
      const { data: auth } = await supabase.auth.getUser();
      if (auth.user) {
        await supabase
          .from("preferences")
          .upsert(
            { user_id: auth.user.id, playback_speed: input.playbackSpeed },
            { onConflict: "user_id" },
          );
      }
      return savePlan({ data: { courseId, ...input } });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["course", courseId] });
      toast.success(result.days > 0 ? `Plan split across ${result.days} days` : "Plan cleared");
    },
    onError: () => toast.error("Could not save the plan"),
  });
  const [daysInput, setDaysInput] = useState("");
  const [hoursInput, setHoursInput] = useState("2");
  const [speed, setSpeed] = useState(1);
  const [openDays, setOpenDays] = useState(new Set());
  const [view, setView] = useState("list");
  const [search, setSearch] = useState("");
  const [monthAnchor, setMonthAnchor] = useState(() => new Date());
  const targetDays = query.data?.course.target_days ?? null;
  const savedCap = query.data?.course.daily_cap_minutes ?? null;
  const savedSpeed = query.data?.prefs?.playback_speed;
  useEffect(() => {
    setDaysInput(targetDays ? String(targetDays) : "");
  }, [targetDays]);
  useEffect(() => {
    if (savedCap) setHoursInput(formatHours(savedCap));
  }, [savedCap]);
  useEffect(() => {
    if (savedSpeed != null) setSpeed(normalizeSpeed(savedSpeed));
  }, [savedSpeed]);
  const byLesson = useMemo(
    () => new Map((query.data?.progress ?? []).map((p) => [p.lesson_id, p])),
    [query.data?.progress],
  );
  const dayPlans = useMemo(() => groupByDay(query.data?.lessons ?? []), [query.data?.lessons]);
  // The day the learner is actually on: first day with an unfinished lesson.
  const activeDay = useMemo(
    () =>
      dayPlans.find((plan) => plan.lessons.some((l) => !byLesson.get(l.id)?.completed))?.day ??
      null,
    [dayPlans, byLesson],
  );
  useEffect(() => {
    if (dayPlans.length === 0) return;
    setOpenDays((prev) => {
      if (prev.size > 0) return prev;
      return new Set([activeDay ?? dayPlans[0].day]);
    });
  }, [dayPlans, activeDay]);
  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-5 p-5">
        <Skeleton className="h-40" />
        <Skeleton className="h-96" />
      </div>
    );
  }
  const data = query.data;
  const stats = computeCourseStats(data.lessons, data.progress);
  const eta = estimatedCompletionDate(
    stats.remainingSeconds,
    savedCap ?? data.prefs?.daily_target_minutes ?? 60,
    speed,
  );
  const nextLesson = data.lessons.find((l) => !byLesson.get(l.id)?.completed) ?? data.lessons[0];
  const parsedDays = Number.parseInt(daysInput, 10);
  const validDays =
    Number.isFinite(parsedDays) && parsedDays >= 1 && parsedDays <= MAX_TARGET_DAYS
      ? parsedDays
      : null;
  const parsedHours = Number.parseFloat(hoursInput);
  const capMinutes =
    Number.isFinite(parsedHours) && parsedHours > 0
      ? Math.min(
          MAX_DAILY_CAP_MINUTES,
          Math.max(MIN_DAILY_CAP_MINUTES, Math.round(parsedHours * 60)),
        )
      : null;
  // Every preview below runs on speed-adjusted durations, matching the server.
  const schedulable = scaleForSpeed(
    data.lessons.map((l) => ({ id: l.id, duration_seconds: l.duration_seconds })),
    speed,
  );
  const capPlan =
    capMinutes && schedulable.length > 0 ? summarizeCapPlan(schedulable, capMinutes * 60) : null;
  const overTarget = capPlan && validDays ? capPlan.daysNeeded > validDays : false;
  const neededCap = overTarget && validDays ? suggestedCapMinutes(schedulable, validDays) : null;
  /** Real clock-time a lesson costs at the selected speed. */
  const atSpeed = (seconds) => Math.round(seconds / speed);
  // Day 1 is anchored so the active day always lands on today ("aaj kaha hoon").
  const planStart = (() => {
    const today = new Date();
    const anchor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    anchor.setDate(anchor.getDate() - ((activeDay ?? 1) - 1));
    return anchor;
  })();
  const dayByDate = new Map(
    dayPlans.map((plan) => [dateKey(dateForDay(planStart, plan.day)), plan]),
  );
  const todayKey = dateKey(new Date());
  const filteredLessons = search.trim()
    ? data.lessons.filter((l) => l.title.toLowerCase().includes(search.trim().toLowerCase()))
    : data.lessons;
  const matchIds = new Set(filteredLessons.map((l) => l.id));
  const filtering = search.trim().length > 0;
  function toggleDay(day) {
    setOpenDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }
  function renderLessonRow(lesson, index) {
    const progress = byLesson.get(lesson.id);
    const done = Boolean(progress?.completed);
    return (
      <li
        key={lesson.id}
        className="flex items-center gap-3 border-t border-sheet-border px-4 py-3 transition-colors first:border-t-0 hover:bg-sheet-muted/60 sm:px-5"
      >
        <DoneToggle
          done={done}
          onToggle={() => toggleComplete.mutate({ lessonId: lesson.id, completed: !done })}
        />
        <span className="w-6 shrink-0 text-mono-xs text-sheet-muted-foreground">{index + 1}</span>
        <Link
          to="/course/$courseId/lesson/$lessonId"
          params={{ courseId, lessonId: lesson.id }}
          className="group flex min-w-0 flex-1 items-center gap-3"
        >
          {lesson.thumbnail_url ? (
            <img
              src={lesson.thumbnail_url}
              alt=""
              loading="lazy"
              className="hidden h-10 w-16 shrink-0 rounded-md object-cover sm:block"
            />
          ) : null}
          <span
            className={cn(
              "line-clamp-2 text-sm transition-colors group-hover:text-sheet-accent",
              done
                ? "text-sheet-muted-foreground line-through decoration-sheet-border"
                : "text-sheet-foreground",
            )}
          >
            {lesson.title}
          </span>
        </Link>
        <span className="shrink-0 text-right text-mono-xs text-sheet-muted-foreground">
          {formatDuration(lesson.duration_seconds)}
          {speed !== 1 ? (
            <span className="block text-sheet-accent">
              {formatDuration(atSpeed(lesson.duration_seconds))}
            </span>
          ) : null}
        </span>
      </li>
    );
  }
  return (
    <div className="min-h-full bg-sheet text-sheet-foreground">
      <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
        <Link
          to="/courses"
          className="inline-flex items-center gap-1.5 text-sm text-sheet-muted-foreground transition-colors hover:text-sheet-accent"
        >
          <ArrowLeft className="size-4" /> Courses
        </Link>

        {/* Header card */}
        <section className="rounded-xl border border-sheet-border bg-sheet-card p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap gap-5">
            {data.course.thumbnail_url ? (
              <img
                src={data.course.thumbnail_url}
                alt={data.course.title}
                loading="lazy"
                className="h-28 w-48 rounded-lg object-cover"
              />
            ) : null}
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
                  {data.course.title}
                </h1>
                <p className="mt-1 text-sm text-sheet-muted-foreground">
                  {data.course.channel_title}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {nextLesson ? (
                  <Button
                    asChild
                    size="sm"
                    className="gap-2 bg-sheet-accent text-sheet-accent-foreground hover:bg-sheet-accent/90"
                  >
                    <Link
                      to="/course/$courseId/lesson/$lessonId"
                      params={{ courseId, lessonId: nextLesson.id }}
                    >
                      <PlayCircle className="size-4" />
                      {stats.completed === 0 ? "Start course" : "Continue"}
                    </Link>
                  </Button>
                ) : null}
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="gap-2 border-sheet-border bg-sheet-card text-sheet-foreground hover:bg-sheet-muted"
                >
                  <a
                    href={`https://www.youtube.com/playlist?list=${data.course.playlist_id}`}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    <Youtube className="size-4" /> Playlist on YouTube
                  </a>
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-2.5 sm:grid-cols-4">
            <StatTile icon={Trophy} label="Lessons" value={`${stats.completed}/${stats.total}`} />
            <StatTile
              icon={Clock}
              label="Remaining"
              value={formatDuration(atSpeed(stats.remainingSeconds))}
            />
            <StatTile
              icon={Gauge}
              label="Pace"
              value={
                savedCap ? `${formatHours(savedCap)}h · ${formatSpeed(speed)}` : formatSpeed(speed)
              }
            />
            <StatTile
              icon={CalendarClock}
              label="Finish by"
              value={eta ? eta.toLocaleDateString() : "—"}
            />
          </div>
        </section>

        {/* Sticky overall progress */}
        <div className="sticky top-0 z-20 -mx-4 border-b border-sheet-border bg-sheet/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold">Overall progress</p>
            <p className="text-mono-xs text-sheet-muted-foreground">
              {stats.percent}% · {stats.completed}/{stats.total}
            </p>
          </div>
          <SheetProgress value={stats.percent} className="mt-2" />
        </div>

        {/* Plan control */}
        <section className="space-y-4 rounded-xl border border-sheet-border bg-sheet-card p-4 sm:p-5">
          <div>
            <h2 className="text-sm font-semibold">Day-wise study plan</h2>
            <p className="mt-1 text-xs text-sheet-muted-foreground">
              {dayPlans.length > 0
                ? `Split across ${dayPlans.length} days${savedCap ? ` at up to ${formatHours(savedCap)} hrs/day` : ""}${speed !== 1 ? ` · watched at ${formatSpeed(speed)}` : ""}.`
                : "Set your hours per day — lessons get grouped into days without ever splitting a video."}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="cap-hours" className="text-xs">
                Hours available per day
              </Label>
              <Input
                id="cap-hours"
                type="number"
                min={0.25}
                max={24}
                step={0.25}
                inputMode="decimal"
                value={hoursInput}
                onChange={(event) => setHoursInput(event.target.value)}
                className="w-28 border-sheet-border bg-sheet text-sheet-foreground"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plan-days" className="text-xs">
                Target days to finish (optional)
              </Label>
              <Input
                id="plan-days"
                type="number"
                min={1}
                max={MAX_TARGET_DAYS}
                inputMode="numeric"
                value={daysInput}
                onChange={(event) => setDaysInput(event.target.value)}
                placeholder="e.g. 20"
                className="w-28 border-sheet-border bg-sheet text-sheet-foreground"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Watch speed</Label>
              <div className="flex flex-wrap gap-1.5">
                {PLAYBACK_SPEEDS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={speed === option}
                    onClick={() => setSpeed(option)}
                    className={cn(
                      "rounded-md border px-2 py-1 text-mono-xs transition-colors",
                      speed === option
                        ? "border-sheet-accent bg-sheet-accent text-sheet-accent-foreground"
                        : "border-sheet-border bg-sheet text-sheet-muted-foreground hover:border-sheet-accent",
                    )}
                  >
                    {formatSpeed(option)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {capPlan ? (
            <p className="text-xs text-sheet-muted-foreground">
              At {hoursInput} hrs/day and {formatSpeed(speed)} this course takes{" "}
              <strong className="text-sheet-foreground">{capPlan.daysNeeded} days</strong> ·{" "}
              {formatDuration(capPlan.totalSeconds)} of real watch time
              {speed !== 1 ? ` (${formatDuration(stats.totalSeconds)} at 1x)` : ""}.
            </p>
          ) : null}

          {overTarget && capPlan && validDays ? (
            <div className="flex gap-2 rounded-lg bg-sheet-accent/10 p-3 text-xs text-sheet-foreground">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-sheet-accent" />
              <div className="space-y-2">
                <p>
                  At this pace ({hoursInput} hrs/day at {formatSpeed(speed)}) the playlist finishes
                  in <strong>{capPlan.daysNeeded} days</strong>, not {validDays}. Give more time per
                  day, watch faster, or extend the deadline.
                </p>
                <div className="flex flex-wrap gap-2">
                  {neededCap ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-sheet-border bg-sheet-card text-sheet-foreground hover:bg-sheet-muted"
                      onClick={() => setHoursInput(formatHours(neededCap))}
                    >
                      Use {formatHours(neededCap)} hrs/day
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-sheet-muted-foreground hover:bg-sheet-muted hover:text-sheet-foreground"
                    onClick={() => setDaysInput(String(capPlan.daysNeeded))}
                  >
                    Accept {capPlan.daysNeeded} days
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              className="gap-2 bg-sheet-accent text-sheet-accent-foreground hover:bg-sheet-accent/90"
              disabled={!capMinutes || planMutation.isPending}
              onClick={() =>
                capMinutes &&
                planMutation.mutate({
                  targetDays: validDays,
                  dailyCapMinutes: capMinutes,
                  playbackSpeed: speed,
                })
              }
            >
              {planMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              {dayPlans.length > 0 ? "Re-plan days" : "Create plan"}
            </Button>
            {dayPlans.length > 0 ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-sheet-muted-foreground hover:bg-sheet-muted hover:text-sheet-foreground"
                disabled={planMutation.isPending}
                onClick={() =>
                  planMutation.mutate({
                    targetDays: null,
                    dailyCapMinutes: null,
                    playbackSpeed: speed,
                  })
                }
              >
                Clear
              </Button>
            ) : null}
          </div>
        </section>

        {/* Toolbar: view switch, search, expand/collapse */}
        <div className="flex flex-wrap items-center gap-2">
          {dayPlans.length > 0 ? (
            <div className="inline-flex rounded-lg border border-sheet-border bg-sheet-card p-0.5">
              {[
                { id: "list", label: "Days", icon: List },
                { id: "calendar", label: "Calendar", icon: CalendarDays },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setView(tab.id)}
                  aria-pressed={view === tab.id}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-[7px] px-3 py-1.5 text-xs font-medium transition-colors",
                    view === tab.id
                      ? "bg-sheet-accent text-sheet-accent-foreground"
                      : "text-sheet-muted-foreground hover:text-sheet-foreground",
                  )}
                >
                  <tab.icon className="size-3.5" /> {tab.label}
                </button>
              ))}
            </div>
          ) : null}

          <div className="relative min-w-40 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-sheet-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search lessons"
              className="h-9 border-sheet-border bg-sheet-card pl-8 text-sheet-foreground"
            />
          </div>

          {view === "list" && dayPlans.length > 0 ? (
            <Button
              size="sm"
              variant="outline"
              className="border-sheet-border bg-sheet-card text-sheet-foreground hover:bg-sheet-muted"
              onClick={() =>
                setOpenDays((prev) =>
                  prev.size === dayPlans.length
                    ? new Set(activeDay ? [activeDay] : [])
                    : new Set(dayPlans.map((plan) => plan.day)),
                )
              }
            >
              {openDays.size === dayPlans.length ? "Collapse all" : "Expand all"}
            </Button>
          ) : null}
        </div>

        {/* Calendar view */}
        {view === "calendar" && dayPlans.length > 0 ? (
          <section className="rounded-xl border border-sheet-border bg-sheet-card p-4 shadow-sm sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">
                {monthAnchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
              </h2>
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="outline"
                  aria-label="Previous month"
                  className="size-8 border-sheet-border bg-sheet-card text-sheet-foreground hover:bg-sheet-muted"
                  onClick={() =>
                    setMonthAnchor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
                  }
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  aria-label="Next month"
                  className="size-8 border-sheet-border bg-sheet-card text-sheet-foreground hover:bg-sheet-muted"
                  onClick={() =>
                    setMonthAnchor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
                  }
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[11px] uppercase tracking-wide text-sheet-muted-foreground">
              {WEEKDAYS.map((day) => (
                <span key={day}>{day.slice(0, 1)}</span>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {monthGrid(monthAnchor).map((date) => {
                const key = dateKey(date);
                const plan = dayByDate.get(key);
                const inMonth = date.getMonth() === monthAnchor.getMonth();
                const done = plan
                  ? plan.lessons.filter((l) => byLesson.get(l.id)?.completed).length
                  : 0;
                const complete = plan ? done === plan.lessons.length : false;
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={!plan}
                    onClick={() => {
                      if (!plan) return;
                      setView("list");
                      setOpenDays(new Set([plan.day]));
                    }}
                    className={cn(
                      "flex min-h-16 flex-col items-start gap-1 rounded-lg border p-1.5 text-left transition-colors",
                      plan
                        ? complete
                          ? "border-sheet-success/50 bg-sheet-success/10 hover:bg-sheet-success/15"
                          : "border-sheet-accent/40 bg-sheet-accent/10 hover:bg-sheet-accent/15"
                        : "border-sheet-border bg-sheet",
                      !inMonth && "opacity-40",
                      key === todayKey && "ring-1 ring-sheet-accent",
                    )}
                  >
                    <span className="text-mono-xs text-sheet-muted-foreground">
                      {date.getDate()}
                    </span>
                    {plan ? (
                      <>
                        <span className="text-[11px] font-semibold">Day {plan.day}</span>
                        <span className="text-[10px] text-sheet-muted-foreground">
                          {formatDuration(atSpeed(plan.totalSeconds))} · {done}/
                          {plan.lessons.length}
                        </span>
                      </>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-4 text-[11px] text-sheet-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-sheet-accent" /> scheduled
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-sheet-success" /> completed
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Flame className="size-3.5 text-sheet-accent" /> today is Day {activeDay ?? 1}
              </span>
            </div>
          </section>
        ) : null}

        {/* Day accordion, or plain list when there is no plan */}
        {view === "list" && dayPlans.length > 0 ? (
          <div className="space-y-3">
            {dayPlans.map((plan) => {
              const lessons = filtering
                ? plan.lessons.filter((l) => matchIds.has(l.id))
                : plan.lessons;
              if (filtering && lessons.length === 0) return null;
              const done = plan.lessons.filter((l) => byLesson.get(l.id)?.completed).length;
              const percent = plan.lessons.length ? (done / plan.lessons.length) * 100 : 0;
              const open = filtering || openDays.has(plan.day);
              const isActive = plan.day === activeDay;
              const complete = done === plan.lessons.length;
              const date = dateForDay(planStart, plan.day);
              return (
                <section
                  key={plan.day}
                  className={cn(
                    "overflow-hidden rounded-xl border bg-sheet-card shadow-sm transition-colors",
                    isActive
                      ? "border-sheet-accent ring-1 ring-sheet-accent/30"
                      : "border-sheet-border",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggleDay(plan.day)}
                    aria-expanded={open}
                    className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-sheet-muted sm:px-5"
                  >
                    <ChevronDown
                      className={cn(
                        "size-4 shrink-0 text-sheet-muted-foreground transition-transform",
                        open && "rotate-180",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                            complete
                              ? "bg-sheet-success/15 text-sheet-success"
                              : "bg-sheet-accent/15 text-sheet-accent",
                          )}
                        >
                          Day {plan.day}
                        </span>
                        {isActive ? (
                          <span className="rounded-full bg-sheet-accent px-2 py-0.5 text-[11px] font-semibold text-sheet-accent-foreground">
                            You are here
                          </span>
                        ) : null}
                        <span className="inline-flex items-center gap-1 text-xs text-sheet-muted-foreground">
                          <CalendarDays className="size-3.5" />
                          {date.toLocaleDateString(undefined, {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs text-sheet-muted-foreground">
                          <Clock className="size-3.5" />
                          {formatDuration(atSpeed(plan.totalSeconds))}
                          {savedCap ? ` of ${formatDuration(savedCap * 60)}` : null}
                        </span>
                        <span className="text-xs text-sheet-muted-foreground">
                          {plan.lessons.length} lesson{plan.lessons.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="mt-2.5 flex items-center gap-3">
                        <SheetProgress value={percent} className="h-1.5 max-w-64" />
                        <span className="shrink-0 text-mono-xs text-sheet-muted-foreground">
                          {done}/{plan.lessons.length}
                        </span>
                      </div>
                    </div>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleDayComplete.mutate({
                          lessons: plan.lessons,
                          completed: !complete,
                        });
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        event.stopPropagation();
                        toggleDayComplete.mutate({
                          lessons: plan.lessons,
                          completed: !complete,
                        });
                      }}
                      className="hidden shrink-0 rounded-md border border-sheet-border px-2 py-1 text-[11px] text-sheet-muted-foreground transition-colors hover:border-sheet-accent hover:text-sheet-accent sm:block"
                    >
                      {complete ? "Reset day" : "Mark day done"}
                    </span>
                  </button>
                  {open ? (
                    <ul className="border-t border-sheet-border">
                      {lessons.map((lesson, index) => renderLessonRow(lesson, index))}
                    </ul>
                  ) : null}
                </section>
              );
            })}
          </div>
        ) : null}

        {view === "list" && dayPlans.length === 0 ? (
          <section className="overflow-hidden rounded-xl border border-sheet-border bg-sheet-card shadow-sm">
            <div className="border-b border-sheet-border px-4 py-3 sm:px-5">
              <h2 className="text-sm font-semibold">Lessons</h2>
            </div>
            <ul>{filteredLessons.map((lesson, index) => renderLessonRow(lesson, index))}</ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
