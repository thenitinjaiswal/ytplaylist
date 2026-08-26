import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, MoreVertical, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { computeCourseStats } from "@/lib/course";
import { formatDuration, formatRelative } from "@/lib/format";
import { ProgressBar } from "@/components/progress-bar";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
export const Route = createFileRoute("/_authenticated/courses/")({
  head: () => ({
    meta: [
      { title: "My courses — CodeStudy" },
      {
        name: "description",
        content: "Every playlist you've imported into CodeStudy, with progress and watch time.",
      },
      { property: "og:title", content: "My courses — CodeStudy" },
      { property: "og:description", content: "Your imported playlists and their progress." },
    ],
  }),
  component: CoursesPage,
});
function CoursesPage() {
  const queryClient = useQueryClient();
  const [term, setTerm] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);
  const query = useQuery({
    queryKey: ["courses-with-progress"],
    queryFn: async () => {
      const [courses, lessons, progress] = await Promise.all([
        supabase.from("courses").select("*").order("created_at", { ascending: false }),
        supabase.from("lessons").select("id, course_id, duration_seconds"),
        supabase
          .from("lesson_progress")
          .select(
            "lesson_id, course_id, completed, watched_seconds, last_position, last_watched_at",
          ),
      ]);
      return {
        courses: courses.data ?? [],
        lessons: lessons.data ?? [],
        progress: progress.data ?? [],
      };
    },
  });
  const remove = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("courses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Course removed");
      queryClient.invalidateQueries({ queryKey: ["courses-with-progress"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: () => toast.error("Could not remove that course"),
  });
  const courses = (query.data?.courses ?? []).filter((course) =>
    term.trim() ? course.title.toLowerCase().includes(term.trim().toLowerCase()) : true,
  );
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">My courses</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {query.data?.courses.length ?? 0} imported{" "}
            {(query.data?.courses.length ?? 0) === 1 ? "playlist" : "playlists"}
          </p>
        </div>
        <Button asChild size="sm" className="gap-2">
          <Link to="/courses/new">
            <Plus className="size-4" /> Import playlist
          </Link>
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Filter courses…"
          className="pl-9"
        />
      </div>

      {query.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : courses.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={term ? "No matches" : "No courses yet"}
          description={
            term
              ? "No imported course matches that filter."
              : "Import a public YouTube playlist to create your first structured course."
          }
          action={
            term ? undefined : (
              <Button asChild size="sm" className="gap-2">
                <Link to="/courses/new">
                  <Plus className="size-4" /> Import a playlist
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => {
            const stats = computeCourseStats(
              (query.data?.lessons ?? []).filter((l) => l.course_id === course.id),
              (query.data?.progress ?? []).filter((p) => p.course_id === course.id),
            );
            return (
              <div
                key={course.id}
                className="group overflow-hidden rounded-lg border border-border bg-surface transition-colors hover:border-ring/40"
              >
                <Link
                  to="/course/$courseId"
                  params={{ courseId: course.id }}
                  className="block aspect-video overflow-hidden bg-elevated"
                >
                  {course.thumbnail_url ? (
                    <img
                      src={course.thumbnail_url}
                      alt={course.title}
                      loading="lazy"
                      className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                  ) : null}
                </Link>
                <div className="space-y-3 p-4">
                  <div className="flex items-start gap-2">
                    <Link
                      to="/course/$courseId"
                      params={{ courseId: course.id }}
                      className="min-w-0 flex-1"
                    >
                      <h2 className="line-clamp-2 text-sm font-semibold text-foreground">
                        {course.title}
                      </h2>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {course.channel_title}
                      </p>
                    </Link>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-7 shrink-0">
                          <MoreVertical className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => setPendingDelete({ id: course.id, title: course.title })}
                          className="text-destructive"
                        >
                          <Trash2 className="mr-2 size-4" /> Delete course
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <ProgressBar value={stats.percent} />
                  <div className="flex items-center justify-between text-mono-xs text-muted-foreground">
                    <span>
                      {stats.completed}/{stats.total} · {formatDuration(stats.remainingSeconds)}{" "}
                      left
                    </span>
                    <span>{formatRelative(course.updated_at)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => (open ? null : setPendingDelete(null))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this course?</AlertDialogTitle>
            <AlertDialogDescription>
              “{pendingDelete?.title}” and all of its lessons, progress, notes and saved files will
              be permanently removed. Your GitHub commits are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) remove.mutate(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
