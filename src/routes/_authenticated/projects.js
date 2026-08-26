import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Code2, FileCode2, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatRelative } from "@/lib/format";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
export const Route = createFileRoute("/_authenticated/projects")({
  head: () => ({
    meta: [
      { title: "Projects — CodeStudy" },
      {
        name: "description",
        content: "Every file you've written per lesson, grouped by course, with saved snapshots.",
      },
      { property: "og:title", content: "Projects — CodeStudy" },
      { property: "og:description", content: "Your lesson files and version snapshots." },
    ],
  }),
  component: ProjectsPage,
});
function ProjectsPage() {
  const query = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const [files, versions, courses, lessons] = await Promise.all([
        supabase
          .from("code_files")
          .select("id, path, language, course_id, lesson_id, updated_at")
          .order("updated_at", { ascending: false }),
        supabase.from("code_versions").select("id, lesson_id, label, created_at"),
        supabase.from("courses").select("id, title"),
        supabase.from("lessons").select("id, title, course_id, position"),
      ]);
      return {
        files: files.data ?? [],
        versions: versions.data ?? [],
        courses: courses.data ?? [],
        lessons: lessons.data ?? [],
      };
    },
  });
  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-5">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  const data = query.data;
  const grouped = data.courses
    .map((course) => ({
      course,
      lessons: data.lessons
        .filter((lesson) => lesson.course_id === course.id)
        .map((lesson) => ({
          lesson,
          files: data.files.filter((file) => file.lesson_id === lesson.id),
          versions: data.versions.filter((version) => version.lesson_id === lesson.id),
        }))
        .filter((entry) => entry.files.length > 0)
        .sort((a, b) => a.lesson.position - b.lesson.position),
    }))
    .filter((group) => group.lessons.length > 0);
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Projects</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Files you've written per lesson, with their saved snapshots.
        </p>
      </div>

      {grouped.length === 0 ? (
        <EmptyState
          icon={Code2}
          title="No project files yet"
          description="Open a lesson workspace and start writing code — files autosave per lesson and show up here."
        />
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => (
            <section
              key={group.course.id}
              className="overflow-hidden rounded-lg border border-border bg-surface"
            >
              <div className="border-b border-border px-4 py-3">
                <Link
                  to="/course/$courseId"
                  params={{ courseId: group.course.id }}
                  className="text-sm font-semibold text-foreground hover:text-primary"
                >
                  {group.course.title}
                </Link>
              </div>
              <ul className="divide-y divide-border">
                {group.lessons.map((entry) => (
                  <li key={entry.lesson.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to="/course/$courseId/lesson/$lessonId"
                        params={{ courseId: group.course.id, lessonId: entry.lesson.id }}
                        className="min-w-0 flex-1 truncate text-sm text-foreground hover:text-primary"
                      >
                        {entry.lesson.position + 1}. {entry.lesson.title}
                      </Link>
                      {entry.versions.length > 0 ? (
                        <span className="inline-flex items-center gap-1.5 text-mono-xs text-muted-foreground">
                          <History className="size-3.5" /> {entry.versions.length} snapshots
                        </span>
                      ) : null}
                    </div>
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {entry.files.map((file) => (
                        <li
                          key={file.id}
                          className="inline-flex items-center gap-1.5 rounded border border-border bg-elevated/50 px-2 py-1 text-mono-xs text-muted-foreground"
                        >
                          <FileCode2 className="size-3.5" />
                          {file.path}
                          <span className="opacity-60">{formatRelative(file.updated_at)}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
