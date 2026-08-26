import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, ChevronLeft, ChevronRight, ListVideo } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDuration } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
export function LessonSidebar({ courseId, activeLessonId, collapsed, onToggle }) {
  const data = useQuery({
    queryKey: ["lesson-sidebar", courseId],
    staleTime: 30_000,
    queryFn: async () => {
      const [lessons, progress, course] = await Promise.all([
        supabase
          .from("lessons")
          .select("id, title, position, duration_seconds")
          .eq("course_id", courseId)
          .order("position", { ascending: true }),
        supabase.from("lesson_progress").select("lesson_id, completed").eq("course_id", courseId),
        supabase.from("courses").select("title").eq("id", courseId).maybeSingle(),
      ]);
      return {
        lessons: lessons.data ?? [],
        done: new Set((progress.data ?? []).filter((p) => p.completed).map((p) => p.lesson_id)),
        courseTitle: course.data?.title ?? "Course",
      };
    },
  });
  const lessons = data.data?.lessons ?? [];
  return (
    <aside
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-surface"
      aria-label="Course lessons"
    >
      <header className="flex h-9 shrink-0 items-center gap-1.5 border-b border-border px-2">
        <ListVideo className="size-3.5 shrink-0 text-muted-foreground" />
        {collapsed ? null : (
          <span className="truncate text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            Lessons
          </span>
        )}
        <div className="flex-1" />
        <Button
          size="icon"
          variant="ghost"
          className="size-6 text-muted-foreground hover:text-foreground"
          aria-label={collapsed ? "Expand lesson sidebar" : "Collapse lesson sidebar"}
          onClick={onToggle}
        >
          {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronLeft className="size-3.5" />}
        </Button>
      </header>

      {collapsed ? null : (
        <p className="truncate border-b border-border px-2.5 py-2 text-xs text-muted-foreground">
          {data.data?.courseTitle}
        </p>
      )}

      <nav className="min-h-0 flex-1 overflow-y-auto p-1">
        {lessons.map((lesson) => {
          const isActive = lesson.id === activeLessonId;
          const isDone = data.data?.done.has(lesson.id) ?? false;
          const item = (
            <Link
              key={lesson.id}
              to="/course/$courseId/lesson/$lessonId"
              params={{ courseId, lessonId: lesson.id }}
              className={cn(
                "flex items-center gap-2 rounded px-1.5 py-1.5 text-xs",
                collapsed ? "justify-center" : "",
                isActive
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded text-mono-xs",
                  isDone
                    ? "bg-success/15 text-success"
                    : isActive
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {isDone ? <Check className="size-3" /> : lesson.position + 1}
              </span>
              {collapsed ? null : (
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{lesson.title}</span>
                  <span className="block text-mono-xs text-muted-foreground">
                    {formatDuration(lesson.duration_seconds ?? 0)}
                    {isDone ? " · done" : ""}
                  </span>
                </span>
              )}
            </Link>
          );
          if (!collapsed) return item;
          return (
            <Tooltip key={lesson.id}>
              <TooltipTrigger asChild>{item}</TooltipTrigger>
              <TooltipContent side="right">
                {lesson.position + 1}. {lesson.title}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </nav>
    </aside>
  );
}
