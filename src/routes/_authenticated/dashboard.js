import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Flame, PlayCircle, Plus, Timer, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { computeStreak, computeCourseStats } from "@/lib/course";
import { formatDuration, formatRelative, toDayKey } from "@/lib/format";
import { ProgressBar } from "@/components/progress-bar";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — CodeStudy" },
      {
        name: "description",
        content: "Your learning streak, watch time and courses in progress on CodeStudy.",
      },
      { property: "og:title", content: "Dashboard — CodeStudy" },
      { property: "og:description", content: "Track streaks, watch time and course progress." },
    ],
  }),
  component: Dashboard,
});
function Dashboard() {
  const query = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [courses, lessons, progress, activities] = await Promise.all([
        supabase
          .from("courses")
          .select("id, title, channel_title, thumbnail_url, video_count, total_seconds, updated_at")
          .order("updated_at", { ascending: false }),
        supabase.from("lessons").select("id, course_id, duration_seconds, position, title"),
        supabase
          .from("lesson_progress")
          .select(
            "lesson_id, course_id, watched_seconds, completed, last_position, last_watched_at",
          )
          .order("last_watched_at", { ascending: false }),
        supabase.from("activities").select("day, seconds, kind, created_at").limit(1000),
      ]);
      return {
        courses: courses.data ?? [],
        lessons: lessons.data ?? [],
        progress: progress.data ?? [],
        activities: activities.data ?? [],
      };
    },
  });
  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 p-5">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }
  const data = query.data;
  const streak = computeStreak(data.activities.map((a) => a.day));
  const totalWatched = data.progress.reduce((sum, p) => sum + p.watched_seconds, 0);
  const completedLessons = data.progress.filter((p) => p.completed).length;
  const today = toDayKey(new Date());
  const todaySeconds = data.activities
    .filter((a) => a.day === today)
    .reduce((sum, a) => sum + a.seconds, 0);
  const resume = data.progress.find((p) => !p.completed) ?? data.progress[0];
  const resumeLesson = resume ? data.lessons.find((l) => l.id === resume.lesson_id) : undefined;
  const resumeCourse = resume ? data.courses.find((c) => c.id === resume.course_id) : undefined;
  return (
    <div className="mx-auto max-w-6xl space-y-8 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {todaySeconds > 0
              ? `${formatDuration(todaySeconds)} studied today — keep it going.`
              : "Nothing studied today yet. A single lesson keeps the streak alive."}
          </p>
        </div>
        <Button asChild size="sm" className="gap-2">
          <Link to="/courses/new">
            <Plus className="size-4" /> Import playlist
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Flame}
          label="Current streak"
          value={`${streak.current} ${streak.current === 1 ? "day" : "days"}`}
          hint={`Longest ${streak.longest}`}
        />
        <StatCard
          icon={Timer}
          label="Total watch time"
          value={formatDuration(totalWatched)}
          hint={`${formatDuration(todaySeconds)} today`}
        />
        <StatCard
          icon={Trophy}
          label="Lessons completed"
          value={String(completedLessons)}
          hint={`of ${data.lessons.length}`}
        />
        <StatCard
          icon={BookOpen}
          label="Courses"
          value={String(data.courses.length)}
          hint="imported playlists"
        />
      </div>

      {resumeLesson && resumeCourse ? (
        <section className="rounded-lg border border-border bg-surface p-5">
          <p className="text-mono-xs uppercase tracking-widest text-muted-foreground">
            Continue where you left off
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-base font-semibold text-foreground">
                {resumeLesson.title}
              </h2>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {resumeCourse.title} · lesson {resumeLesson.position + 1} ·{" "}
                {formatRelative(resume?.last_watched_at)}
              </p>
            </div>
            <Button asChild className="gap-2">
              <Link
                to="/course/$courseId/lesson/$lessonId"
                params={{ courseId: resumeCourse.id, lessonId: resumeLesson.id }}
              >
                <PlayCircle className="size-4" /> Resume
              </Link>
            </Button>
          </div>
        </section>
      ) : null}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Courses in progress</h2>
          <Link to="/courses" className="text-sm text-muted-foreground hover:text-foreground">
            View all
          </Link>
        </div>

        {data.courses.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No courses yet"
            description="Import a public YouTube playlist and CodeStudy will turn it into a structured course with lessons, durations and progress tracking."
            action={
              <Button asChild size="sm" className="gap-2">
                <Link to="/courses/new">
                  <Plus className="size-4" /> Import a playlist
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.courses.slice(0, 6).map((course) => {
              const courseLessons = data.lessons.filter((l) => l.course_id === course.id);
              const stats = computeCourseStats(
                courseLessons,
                data.progress.filter((p) => p.course_id === course.id),
              );
              return (
                <Link
                  key={course.id}
                  to="/course/$courseId"
                  params={{ courseId: course.id }}
                  className="group overflow-hidden rounded-lg border border-border bg-surface transition-colors hover:border-ring/40"
                >
                  <div className="aspect-video overflow-hidden bg-elevated">
                    {course.thumbnail_url ? (
                      <img
                        src={course.thumbnail_url}
                        alt={course.title}
                        loading="lazy"
                        className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                      />
                    ) : null}
                  </div>
                  <div className="space-y-3 p-4">
                    <h3 className="line-clamp-2 text-sm font-semibold text-foreground">
                      {course.title}
                    </h3>
                    <ProgressBar value={stats.percent} />
                    <div className="flex items-center justify-between text-mono-xs text-muted-foreground">
                      <span>
                        {stats.completed}/{stats.total} lessons
                      </span>
                      <span>{stats.percent}%</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
function StatCard({ icon: Icon, label, value, hint }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4" />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="mt-0.5 text-mono-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
