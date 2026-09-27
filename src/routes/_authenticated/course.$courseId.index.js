import { useState, useMemo } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Calendar,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  Gauge,
  Layers,
  ListOrdered,
  PlayCircle,
  Search,
  SlidersHorizontal,
  Sparkles,
  Target,
  Youtube,
  Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { computeCourseStats, estimatedCompletionDate } from "@/lib/course";
import { formatDuration } from "@/lib/format";
import {
  assignScheduledDays,
  groupByDay,
  scaleForSpeed,
} from "@/lib/study-plan";
import { ProgressBar } from "@/components/progress-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CoursePlannerDialog } from "@/components/course-planner-dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/course/$courseId/")({
  head: () => ({
    meta: [
      { title: "Course — CodeStudy" },
      {
        name: "description",
        content: "Lesson list, daily study planner, monthly breakdown and progress for this course.",
      },
      { property: "og:title", content: "Course — CodeStudy" },
      { property: "og:description", content: "Lesson list, daily study planner and progress for your course." },
    ],
  }),
  component: CoursePage,
});

function CoursePage() {
  const { courseId } = Route.useParams();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState("days"); // "days" | "months" | "all"
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all"); // "all" | "completed" | "pending"
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [expandedDays, setExpandedDays] = useState(new Set([1])); // Day 1 open by default
  const [expandedMonths, setExpandedMonths] = useState(new Set([1])); // Month 1 open by default
  const [overrideSpeed, setOverrideSpeed] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("codestudy.playback_speed");
      if (stored) return Number(stored);
    }
    return null;
  });

  const query = useQuery({
    queryKey: ["course", courseId],
    queryFn: async () => {
      const [course, lessons, progress, prefs] = await Promise.all([
        supabase.from("courses").select("*").eq("id", courseId).maybeSingle(),
        supabase
          .from("lessons")
          .select("*")
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
      const lesson = query.data?.lessons?.find((l) => l.id === lessonId);
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
  });

  const data = query.data;

  // Stats and Plan Settings
  const speed = Number(
    overrideSpeed ??
      data?.prefs?.playback_speed ??
      (typeof window !== "undefined" ? Number(localStorage.getItem("codestudy.playback_speed")) || 1 : 1),
  );
  const dailyTargetMinutes = Number(data?.course?.daily_cap_minutes || data?.prefs?.daily_target_minutes || 60);
  const targetDays = Number(data?.course?.target_days || 60);

  const stats = useMemo(() => {
    return computeCourseStats(data?.lessons ?? [], data?.progress ?? []);
  }, [data?.lessons, data?.progress]);

  const byLesson = useMemo(() => {
    return new Map((data?.progress ?? []).map((p) => [p.lesson_id, p]));
  }, [data?.progress]);

  // Scaled remaining time at preferred speed
  const effectiveRemainingSeconds = Math.round(stats.remainingSeconds / speed);
  const effectiveTotalSeconds = Math.round(stats.totalSeconds / speed);

  // Projected finish date based on speed and daily target
  const eta = useMemo(() => {
    return estimatedCompletionDate(
      stats.remainingSeconds,
      dailyTargetMinutes,
      speed,
    );
  }, [stats.remainingSeconds, dailyTargetMinutes, speed]);

  // Next up uncompleted lesson
  const nextLesson = useMemo(() => {
    return (data?.lessons ?? []).find((l) => !byLesson.get(l.id)?.completed) ?? (data?.lessons ?? [])[0];
  }, [data?.lessons, byLesson]);

  // Assign Scheduled Days to Lessons dynamically
  const scheduledLessons = useMemo(() => {
    const rawLessons = data?.lessons ?? [];
    if (rawLessons.length === 0) return [];

    // Scale durations for preferred speed
    const scaled = scaleForSpeed(rawLessons, speed);
    const scheduleMap = assignScheduledDays(scaled, targetDays);

    return rawLessons.map((l) => ({
      ...l,
      scheduled_day: scheduleMap.get(l.id) || l.scheduled_day || 1,
    }));
  }, [data?.lessons, speed, targetDays]);

  // Group lessons by Day
  const daysGrouped = useMemo(() => {
    const buckets = new Map();
    for (const lesson of scheduledLessons) {
      const d = lesson.scheduled_day || 1;
      const list = buckets.get(d) ?? [];
      list.push(lesson);
      buckets.set(d, list);
    }

    return [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([day, items]) => {
        const completedCount = items.filter((l) => byLesson.get(l.id)?.completed).length;
        const totalDuration = items.reduce((sum, l) => sum + (l.duration_seconds || 0), 0);
        return {
          day,
          lessons: items,
          totalSeconds: totalDuration,
          effectiveSeconds: Math.round(totalDuration / speed),
          completedCount,
          isCompleted: completedCount === items.length && items.length > 0,
          inProgress: completedCount > 0 && completedCount < items.length,
        };
      });
  }, [scheduledLessons, byLesson, speed]);

  // Group days into Months (Month 1 = Days 1-30, Month 2 = Days 31-60, etc.)
  const monthsGrouped = useMemo(() => {
    const months = [];
    const DAYS_PER_MONTH = 30;
    const totalMonths = Math.max(1, Math.ceil(daysGrouped.length / DAYS_PER_MONTH));

    for (let m = 1; m <= totalMonths; m++) {
      const startDay = (m - 1) * DAYS_PER_MONTH + 1;
      const endDay = m * DAYS_PER_MONTH;
      const monthDays = daysGrouped.filter((d) => d.day >= startDay && d.day <= endDay);
      const monthLessons = monthDays.flatMap((d) => d.lessons);
      const completedCount = monthLessons.filter((l) => byLesson.get(l.id)?.completed).length;
      const totalSeconds = monthLessons.reduce((sum, l) => sum + (l.duration_seconds || 0), 0);

      months.push({
        monthNumber: m,
        startDay,
        endDay: Math.min(endDay, daysGrouped[daysGrouped.length - 1]?.day || endDay),
        days: monthDays,
        lessons: monthLessons,
        totalSeconds,
        effectiveSeconds: Math.round(totalSeconds / speed),
        completedCount,
        percent: monthLessons.length === 0 ? 0 : Math.round((completedCount / monthLessons.length) * 100),
        isCompleted: completedCount === monthLessons.length && monthLessons.length > 0,
      });
    }
    return months;
  }, [daysGrouped, byLesson, speed]);

  // Today's Target Day (first incomplete day)
  const todayDay = useMemo(() => {
    return daysGrouped.find((d) => !d.isCompleted) || daysGrouped[0];
  }, [daysGrouped]);

  // Toggle expand/collapse for days
  const toggleDayExpanded = (dayNum) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dayNum)) next.delete(dayNum);
      else next.add(dayNum);
      return next;
    });
  };

  // Toggle expand/collapse for months
  const toggleMonthExpanded = (monthNum) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(monthNum)) next.delete(monthNum);
      else next.add(monthNum);
      return next;
    });
  };

  // Filter and search lessons
  const filteredLessons = useMemo(() => {
    return (data?.lessons ?? []).filter((lesson) => {
      const matchSearch =
        !searchQuery.trim() ||
        lesson.title.toLowerCase().includes(searchQuery.toLowerCase().trim());
      const isDone = byLesson.get(lesson.id)?.completed;

      if (!matchSearch) return false;
      if (filterStatus === "completed") return isDone;
      if (filterStatus === "pending") return !isDone;
      return true;
    });
  }, [data?.lessons, searchQuery, filterStatus, byLesson]);

  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-5 p-5">
        <Skeleton className="h-40" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-5">
      <Link
        to="/courses"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition"
      >
        <ArrowLeft className="size-4" /> Courses
      </Link>

      {/* Course Hero & Study Goal Summary Card */}
      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        <div className="flex flex-col md:flex-row gap-5 p-5 md:p-6">
          {data?.course?.thumbnail_url ? (
            <img
              src={data.course.thumbnail_url}
              alt={data.course.title}
              className="h-36 w-full md:w-60 rounded-lg object-cover shadow-sm shrink-0 border border-border/60"
            />
          ) : null}

          <div className="min-w-0 flex-1 space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
              <div>
                <h1 className="text-xl font-bold tracking-tight text-foreground">
                  {data?.course?.title}
                </h1>
                <p className="mt-0.5 text-xs text-muted-foreground font-medium">
                  {data?.course?.channel_title}
                </p>
              </div>

              {/* Study Planner Action Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPlannerOpen(true)}
                className="gap-2 shrink-0 border-primary/40 bg-primary/5 hover:bg-primary/10 text-primary font-medium text-xs h-8 shadow-xs"
              >
                <SlidersHorizontal className="size-3.5" />
                Adjust Study Plan & Speed
              </Button>
            </div>

            {/* Course Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground">{stats.percent}% Completed</span>
                <span className="text-muted-foreground font-mono">
                  {stats.completed} / {stats.total} lessons
                </span>
              </div>
              <ProgressBar value={stats.percent} className="h-2" />
            </div>

            {/* Course Metrics & Pacing Badges */}
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary" className="gap-1 font-mono text-[11px] py-0.5 px-2">
                <Clock className="size-3 text-primary" />
                {formatDuration(effectiveRemainingSeconds)} left
                {speed > 1 ? ` (@ ${speed}x)` : ""}
              </Badge>

              <Badge variant="secondary" className="gap-1 font-mono text-[11px] py-0.5 px-2">
                <Target className="size-3 text-amber-400" />
                ~{dailyTargetMinutes}m daily target
              </Badge>

              <Badge
                variant="secondary"
                onClick={() => setPlannerOpen(true)}
                className="cursor-pointer hover:bg-emerald-500/20 hover:border-emerald-500/40 transition gap-1 font-mono text-[11px] py-0.5 px-2 border border-border"
                title="Click to adjust playback speed & daily pacing"
              >
                <Zap className="size-3 text-emerald-400" />
                {speed}x Video Speed
              </Badge>

              {eta ? (
                <Badge variant="secondary" className="gap-1 font-mono text-[11px] py-0.5 px-2">
                  <CalendarClock className="size-3 text-blue-400" />
                  finish by {eta.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                </Badge>
              ) : null}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              {nextLesson ? (
                <Button asChild size="sm" className="gap-2 font-medium">
                  <Link
                    to="/course/$courseId/lesson/$lessonId"
                    params={{ courseId, lessonId: nextLesson.id }}
                  >
                    <PlayCircle className="size-4" />
                    {stats.completed === 0 ? "Start Course" : "Continue Next Lesson"}
                  </Link>
                </Button>
              ) : null}

              {data?.course?.playlist_id ? (
                <Button asChild size="sm" variant="outline" className="gap-2 text-xs">
                  <a
                    href={`https://www.youtube.com/playlist?list=${data.course.playlist_id}`}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    <Youtube className="size-3.5 text-red-500" /> Playlist on YouTube
                  </a>
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* Today's Target Highlight Banner */}
      {todayDay && stats.completed < stats.total ? (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 text-xs">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/20 text-primary font-bold">
              D{todayDay.day}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-foreground">
                  Today's Target: Day {todayDay.day}
                </span>
                <Badge variant="outline" className="text-[10px] text-primary border-primary/40 font-mono">
                  {todayDay.completedCount}/{todayDay.lessons.length} done
                </Badge>
              </div>
              <p className="text-muted-foreground mt-0.5">
                {todayDay.lessons.length} lessons • ~{formatDuration(todayDay.effectiveSeconds)} watch time
              </p>
            </div>
          </div>

          <Button asChild size="sm" className="h-8 gap-1.5 text-xs font-semibold shrink-0">
            <Link
              to="/course/$courseId/lesson/$lessonId"
              params={{
                courseId,
                lessonId:
                  todayDay.lessons.find((l) => !byLesson.get(l.id)?.completed)?.id ||
                  todayDay.lessons[0]?.id,
              }}
            >
              <PlayCircle className="size-3.5" /> Start Day {todayDay.day}
            </Link>
          </Button>
        </div>
      ) : null}

      {/* Curriculum View Switcher & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full sm:w-auto">
          <TabsList className="grid w-full grid-cols-3 sm:w-auto">
            <TabsTrigger value="days" className="gap-1.5 text-xs">
              <Calendar className="size-3.5" /> Day-by-Day Plan ({daysGrouped.length}d)
            </TabsTrigger>
            <TabsTrigger value="months" className="gap-1.5 text-xs">
              <Layers className="size-3.5" /> Monthly Roadmap ({monthsGrouped.length}m)
            </TabsTrigger>
            <TabsTrigger value="all" className="gap-1.5 text-xs">
              <ListOrdered className="size-3.5" /> All Lessons ({stats.total})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Search & Quick Filters */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search lessons..."
            className="h-8 pl-8 text-xs bg-surface"
          />
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* TAB 1: DAY-BY-DAY PLAN VIEW                                   */}
      {/* ------------------------------------------------------------- */}
      {activeTab === "days" ? (
        <div className="space-y-3">
          {daysGrouped.map((dayItem) => {
            const isExpanded = expandedDays.has(dayItem.day);
            const isToday = todayDay?.day === dayItem.day && !dayItem.isCompleted;

            return (
              <div
                key={dayItem.day}
                className={cn(
                  "overflow-hidden rounded-lg border bg-surface transition-shadow",
                  isToday
                    ? "border-primary/50 shadow-sm"
                    : dayItem.isCompleted
                      ? "border-border/60 bg-surface/50"
                      : "border-border",
                )}
              >
                {/* Day Header Bar */}
                <button
                  type="button"
                  onClick={() => toggleDayExpanded(dayItem.day)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-elevated/30 transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={cn(
                        "flex size-7 items-center justify-center rounded-md text-xs font-bold font-mono shrink-0",
                        dayItem.isCompleted
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                          : isToday
                            ? "bg-primary text-primary-foreground"
                            : "bg-elevated text-muted-foreground",
                      )}
                    >
                      {dayItem.isCompleted ? "✓" : dayItem.day}
                    </span>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-foreground">
                          Day {dayItem.day}
                        </span>
                        {isToday ? (
                          <Badge className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0 font-medium">
                            Today's Goal
                          </Badge>
                        ) : null}
                        {dayItem.isCompleted ? (
                          <Badge variant="secondary" className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0 font-medium">
                            Completed
                          </Badge>
                        ) : null}
                      </div>

                      <p className="text-[11px] text-muted-foreground">
                        {dayItem.lessons.length} {dayItem.lessons.length === 1 ? "lesson" : "lessons"} • ~{formatDuration(dayItem.effectiveSeconds)}
                        {speed > 1 ? ` (@ ${speed}x)` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-mono-xs text-muted-foreground font-medium">
                      {dayItem.completedCount}/{dayItem.lessons.length}
                    </span>
                    {isExpanded ? (
                      <ChevronDown className="size-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-4 text-muted-foreground" />
                    )}
                  </div>
                </button>

                {/* Lessons in this Day */}
                {isExpanded ? (
                  <ul className="divide-y divide-border border-t border-border bg-background/40">
                    {dayItem.lessons.map((lesson) => {
                      const progress = byLesson.get(lesson.id);
                      const percent =
                        lesson.duration_seconds > 0
                          ? Math.min(
                              100,
                              ((progress?.watched_seconds ?? 0) / lesson.duration_seconds) * 100,
                            )
                          : 0;

                      return (
                        <li
                          key={lesson.id}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-elevated/20 transition"
                        >
                          <button
                            type="button"
                            aria-label={
                              progress?.completed ? "Mark as not completed" : "Mark as completed"
                            }
                            onClick={() =>
                              toggleComplete.mutate({
                                lessonId: lesson.id,
                                completed: !progress?.completed,
                              })
                            }
                            className="shrink-0 text-muted-foreground hover:text-foreground transition"
                          >
                            {progress?.completed ? (
                              <CheckCircle2 className="size-4.5 text-emerald-500" />
                            ) : (
                              <Circle className="size-4.5" />
                            )}
                          </button>

                          <span className="w-6 shrink-0 text-mono-xs text-muted-foreground font-mono">
                            {lesson.position + 1}
                          </span>

                          <Link
                            to="/course/$courseId/lesson/$lessonId"
                            params={{ courseId, lessonId: lesson.id }}
                            className="min-w-0 flex-1 group"
                          >
                            <span
                              className={cn(
                                "line-clamp-1 text-xs sm:text-sm font-medium transition",
                                progress?.completed
                                  ? "text-muted-foreground"
                                  : "text-foreground group-hover:text-primary",
                              )}
                            >
                              {lesson.title}
                            </span>
                            {percent > 0 && !progress?.completed ? (
                              <ProgressBar value={percent} className="mt-1 h-1 max-w-36" />
                            ) : null}
                          </Link>

                          <span className="shrink-0 font-mono text-mono-xs text-muted-foreground">
                            {formatDuration(lesson.duration_seconds)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {/* ------------------------------------------------------------- */}
      {/* TAB 2: MONTHLY ROADMAP BREAKDOWN                              */}
      {/* ------------------------------------------------------------- */}
      {activeTab === "months" ? (
        <div className="space-y-4">
          {monthsGrouped.map((month) => {
            const isExpanded = expandedMonths.has(month.monthNumber);

            return (
              <div
                key={month.monthNumber}
                className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
              >
                {/* Month Milestone Header */}
                <div
                  onClick={() => toggleMonthExpanded(month.monthNumber)}
                  className="cursor-pointer p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-elevated/20 transition"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-base text-foreground">
                        Month {month.monthNumber}
                      </span>
                      <Badge variant="outline" className="text-mono-xs">
                        Days {month.startDay} - {month.endDay}
                      </Badge>
                      {month.isCompleted ? (
                        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">
                          Completed
                        </Badge>
                      ) : null}
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {month.lessons.length} lessons • ~{formatDuration(month.effectiveSeconds)} study time
                      {speed > 1 ? ` (@ ${speed}x)` : ""}
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="w-32 space-y-1">
                      <div className="flex justify-between text-[11px] text-muted-foreground font-mono">
                        <span>{month.percent}%</span>
                        <span>{month.completedCount}/{month.lessons.length}</span>
                      </div>
                      <ProgressBar value={month.percent} className="h-1.5" />
                    </div>

                    {isExpanded ? (
                      <ChevronDown className="size-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-4 text-muted-foreground" />
                    )}
                  </div>
                </div>

                {/* Month Days list */}
                {isExpanded ? (
                  <div className="border-t border-border bg-background/40 p-3 sm:p-4 space-y-2.5">
                    {month.days.map((dayItem) => (
                      <div
                        key={dayItem.day}
                        className="rounded-lg border border-border bg-surface p-3 text-xs space-y-2"
                      >
                        <div className="flex items-center justify-between font-medium">
                          <span className="text-foreground font-semibold">
                            Day {dayItem.day} ({dayItem.lessons.length} lessons)
                          </span>
                          <span className="font-mono text-muted-foreground text-[11px]">
                            {dayItem.completedCount}/{dayItem.lessons.length} completed
                          </span>
                        </div>

                        <ul className="space-y-1.5 pt-1">
                          {dayItem.lessons.map((lesson) => {
                            const progress = byLesson.get(lesson.id);
                            return (
                              <li
                                key={lesson.id}
                                className="flex items-center justify-between gap-2 text-[11px]"
                              >
                                <Link
                                  to="/course/$courseId/lesson/$lessonId"
                                  params={{ courseId, lessonId: lesson.id }}
                                  className={cn(
                                    "truncate flex-1 hover:text-primary transition",
                                    progress?.completed ? "text-muted-foreground" : "text-foreground font-medium",
                                  )}
                                >
                                  {lesson.position + 1}. {lesson.title}
                                </Link>
                                <span className="font-mono text-muted-foreground shrink-0">
                                  {formatDuration(lesson.duration_seconds)}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {/* ------------------------------------------------------------- */}
      {/* TAB 3: ALL LESSONS CLASSIC LIST                               */}
      {/* ------------------------------------------------------------- */}
      {activeTab === "all" ? (
        <section className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-5 py-3 text-xs">
            <h2 className="font-semibold text-foreground">
              All Lessons ({filteredLessons.length})
            </h2>
            <div className="flex gap-1">
              <Button
                variant={filterStatus === "all" ? "secondary" : "ghost"}
                size="sm"
                className="h-6 text-[11px] px-2"
                onClick={() => setFilterStatus("all")}
              >
                All
              </Button>
              <Button
                variant={filterStatus === "pending" ? "secondary" : "ghost"}
                size="sm"
                className="h-6 text-[11px] px-2"
                onClick={() => setFilterStatus("pending")}
              >
                Pending
              </Button>
              <Button
                variant={filterStatus === "completed" ? "secondary" : "ghost"}
                size="sm"
                className="h-6 text-[11px] px-2"
                onClick={() => setFilterStatus("completed")}
              >
                Done
              </Button>
            </div>
          </div>

          <ul className="divide-y divide-border">
            {filteredLessons.map((lesson) => {
              const progress = byLesson.get(lesson.id);
              const percent =
                lesson.duration_seconds > 0
                  ? Math.min(100, ((progress?.watched_seconds ?? 0) / lesson.duration_seconds) * 100)
                  : 0;

              return (
                <li key={lesson.id} className="flex items-center gap-3 px-5 py-3 hover:bg-elevated/20 transition">
                  <button
                    type="button"
                    aria-label={progress?.completed ? "Mark as not completed" : "Mark as completed"}
                    onClick={() =>
                      toggleComplete.mutate({
                        lessonId: lesson.id,
                        completed: !progress?.completed,
                      })
                    }
                    className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {progress?.completed ? (
                      <CheckCircle2 className="size-5 text-emerald-500" />
                    ) : (
                      <Circle className="size-5" />
                    )}
                  </button>

                  <span className="w-7 shrink-0 text-mono-xs text-muted-foreground font-mono">
                    {lesson.position + 1}
                  </span>

                  <Link
                    to="/course/$courseId/lesson/$lessonId"
                    params={{ courseId, lessonId: lesson.id }}
                    className="min-w-0 flex-1 group"
                  >
                    <span
                      className={cn(
                        "line-clamp-1 text-sm font-medium transition",
                        progress?.completed ? "text-muted-foreground" : "text-foreground group-hover:text-primary",
                      )}
                    >
                      {lesson.title}
                    </span>
                    {percent > 0 && !progress?.completed ? (
                      <ProgressBar value={percent} className="mt-1.5 h-1 max-w-40" />
                    ) : null}
                  </Link>

                  <span className="shrink-0 text-mono-xs font-mono text-muted-foreground">
                    {formatDuration(lesson.duration_seconds)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* Course Planner & Pacing Goals Dialog */}
      <CoursePlannerDialog
        open={plannerOpen}
        onOpenChange={setPlannerOpen}
        course={data?.course}
        lessons={data?.lessons ?? []}
        progress={data?.progress ?? []}
        currentDailyTarget={dailyTargetMinutes}
        currentSpeed={speed}
        currentTargetDays={targetDays}
        onPlanSaved={(plan) => {
          if (plan?.speed) {
            setOverrideSpeed(Number(plan.speed));
          }
          queryClient.invalidateQueries({ queryKey: ["course", courseId] });
          queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        }}
      />
    </div>
  );
}
