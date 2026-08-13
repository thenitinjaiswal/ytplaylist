import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarClock, CheckCircle2, Circle, PlayCircle, Youtube } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { computeCourseStats, estimatedCompletionDate } from "@/lib/course";
import { formatDuration } from "@/lib/format";
import { ProgressBar } from "@/components/progress-bar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/course/$courseId/")({
  head: () => ({
    meta: [
      { title: "Course — CodeStudy" },
      {
        name: "description",
        content: "Lesson list, progress and pacing for this imported YouTube course.",
      },
      { property: "og:title", content: "Course — CodeStudy" },
      { property: "og:description", content: "Lesson list and progress for your course." },
    ],
  }),
  component: CoursePage,
});

function CoursePage() {
  const { courseId } = Route.useParams();
  const queryClient = useQueryClient();

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
    mutationFn: async ({ lessonId, completed }: { lessonId: string; completed: boolean }) => {
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
  });

  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-5 p-5">
        <Skeleton className="h-40" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const data = query.data!;
  const stats = computeCourseStats(data.lessons, data.progress);
  const eta = estimatedCompletionDate(
    stats.remainingSeconds,
    data.prefs?.daily_target_minutes ?? 60,
    Number(data.prefs?.playback_speed ?? 1),
  );
  const byLesson = new Map(data.progress.map((p) => [p.lesson_id, p]));
  const nextLesson = data.lessons.find((l) => !byLesson.get(l.id)?.completed) ?? data.lessons[0];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-5">
      <Link
        to="/courses"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Courses
      </Link>

      <section className="flex flex-wrap gap-5 rounded-lg border border-border bg-surface p-5">
        {data.course.thumbnail_url ? (
          <img
            src={data.course.thumbnail_url}
            alt={data.course.title}
            className="h-32 w-56 rounded-md object-cover"
          />
        ) : null}
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              {data.course.title}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{data.course.channel_title}</p>
          </div>
          <ProgressBar value={stats.percent} />
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-mono-xs text-muted-foreground">
            <span>
              {stats.completed}/{stats.total} lessons · {stats.percent}%
            </span>
            <span>{formatDuration(stats.totalSeconds)} total</span>
            <span>{formatDuration(stats.remainingSeconds)} remaining</span>
            {eta ? (
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="size-3.5" />
                finish by {eta.toLocaleDateString()}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {nextLesson ? (
              <Button asChild size="sm" className="gap-2">
                <Link
                  to="/course/$courseId/lesson/$lessonId"
                  params={{ courseId, lessonId: nextLesson.id }}
                >
                  <PlayCircle className="size-4" />
                  {stats.completed === 0 ? "Start course" : "Continue"}
                </Link>
              </Button>
            ) : null}
            <Button asChild size="sm" variant="outline" className="gap-2">
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
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold text-foreground">Lessons</h2>
        </div>
        <ul className="divide-y divide-border">
          {data.lessons.map((lesson) => {
            const progress = byLesson.get(lesson.id);
            const percent =
              lesson.duration_seconds > 0
                ? Math.min(100, ((progress?.watched_seconds ?? 0) / lesson.duration_seconds) * 100)
                : 0;
            return (
              <li key={lesson.id} className="flex items-center gap-3 px-5 py-3">
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
                    <CheckCircle2 className="size-5 text-success" />
                  ) : (
                    <Circle className="size-5" />
                  )}
                </button>
                <span className="w-7 shrink-0 text-mono-xs text-muted-foreground">
                  {lesson.position + 1}
                </span>
                <Link
                  to="/course/$courseId/lesson/$lessonId"
                  params={{ courseId, lessonId: lesson.id }}
                  className="min-w-0 flex-1"
                >
                  <span
                    className={cn(
                      "line-clamp-1 text-sm",
                      progress?.completed ? "text-muted-foreground" : "text-foreground",
                    )}
                  >
                    {lesson.title}
                  </span>
                  {percent > 0 && !progress?.completed ? (
                    <ProgressBar value={percent} className="mt-1.5 h-1 max-w-40" />
                  ) : null}
                </Link>
                <span className="shrink-0 text-mono-xs text-muted-foreground">
                  {formatDuration(lesson.duration_seconds)}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
