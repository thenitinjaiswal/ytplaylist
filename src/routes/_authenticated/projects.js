import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Code2,
  FileCode2,
  History,
  Github,
  CheckSquare,
  Square,
  Search,
  Layers,
  UploadCloud,
  CheckCircle2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatRelative } from "@/lib/format";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ProjectsPushModal } from "@/components/projects-push-modal";

export const Route = createFileRoute("/_authenticated/projects")({
  head: () => ({
    meta: [
      { title: "Projects — CodeStudy" },
      {
        name: "description",
        content: "Every file you've written per lesson, grouped by course, with GitHub push and saved snapshots.",
      },
      { property: "og:title", content: "Projects — CodeStudy" },
      { property: "og:description", content: "Your lesson files, version snapshots, and GitHub sync." },
    ],
  }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const [selectedLessonIds, setSelectedLessonIds] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [pushModalOpen, setPushModalOpen] = useState(false);
  const [modalItems, setModalItems] = useState([]);
  const [modalCourseTitle, setModalCourseTitle] = useState("");

  const query = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const [files, versions, courses, lessons] = await Promise.all([
        supabase
          .from("code_files")
          .select("id, path, language, course_id, lesson_id, content, updated_at")
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

  const data = query.data;

  // Group by Course and Lesson
  const grouped = useMemo(() => {
    return (data?.courses ?? [])
      .map((course) => ({
        course,
        lessons: (data?.lessons ?? [])
          .filter((lesson) => lesson.course_id === course.id)
          .map((lesson) => ({
            lesson,
            course,
            files: (data?.files ?? []).filter((file) => file.lesson_id === lesson.id),
            versions: (data?.versions ?? []).filter((version) => version.lesson_id === lesson.id),
          }))
          .filter((entry) => entry.files.length > 0)
          .sort((a, b) => a.lesson.position - b.lesson.position),
      }))
      .filter((group) => group.lessons.length > 0);
  }, [data]);

  // Flattened all available lesson entries with files
  const allLessonEntries = useMemo(() => {
    return grouped.flatMap((g) => g.lessons);
  }, [grouped]);

  // Filtered by Search Query
  const filteredGrouped = useMemo(() => {
    if (!searchQuery.trim()) return grouped;
    const queryLower = searchQuery.toLowerCase().trim();

    return grouped
      .map((group) => ({
        ...group,
        lessons: group.lessons.filter((entry) => {
          const matchLesson = entry.lesson.title.toLowerCase().includes(queryLower);
          const matchCourse = group.course.title.toLowerCase().includes(queryLower);
          const matchFiles = entry.files.some((f) => f.path.toLowerCase().includes(queryLower));
          return matchLesson || matchCourse || matchFiles;
        }),
      }))
      .filter((group) => group.lessons.length > 0);
  }, [grouped, searchQuery]);

  // Total statistics
  const totalFilesCount = useMemo(() => {
    return allLessonEntries.reduce((sum, item) => sum + item.files.length, 0);
  }, [allLessonEntries]);

  // Toggle single lesson selection
  const toggleLesson = (lessonId) => {
    setSelectedLessonIds((prev) => {
      const next = new Set(prev);
      if (next.has(lessonId)) {
        next.delete(lessonId);
      } else {
        next.add(lessonId);
      }
      return next;
    });
  };

  // Toggle whole course selection
  const toggleCourse = (courseLessons) => {
    const courseLessonIds = courseLessons.map((l) => l.lesson.id);
    const allSelected = courseLessonIds.every((id) => selectedLessonIds.has(id));

    setSelectedLessonIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        courseLessonIds.forEach((id) => next.delete(id));
      } else {
        courseLessonIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  // Select all or deselect all
  const toggleSelectAll = () => {
    if (selectedLessonIds.size === allLessonEntries.length) {
      setSelectedLessonIds(new Set());
    } else {
      setSelectedLessonIds(new Set(allLessonEntries.map((e) => e.lesson.id)));
    }
  };

  // Open Push Modal for specific lesson
  const handlePushSingleLesson = (entry) => {
    setModalItems([entry]);
    setModalCourseTitle(entry.course.title);
    setPushModalOpen(true);
  };

  // Open Push Modal for entire course
  const handlePushCourse = (group) => {
    setModalItems(group.lessons);
    setModalCourseTitle(group.course.title);
    setPushModalOpen(true);
  };

  // Open Push Modal for selected lessons (or all if none selected)
  const handlePushSelected = () => {
    let itemsToPush = [];
    if (selectedLessonIds.size > 0) {
      itemsToPush = allLessonEntries.filter((e) => selectedLessonIds.has(e.lesson.id));
    } else {
      itemsToPush = allLessonEntries;
    }

    if (itemsToPush.length === 0) return;

    setModalItems(itemsToPush);
    const firstCourse = itemsToPush[0]?.course?.title || "";
    setModalCourseTitle(itemsToPush.length === 1 ? firstCourse : `${itemsToPush.length} Lessons`);
    setPushModalOpen(true);
  };

  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-5">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const isAllSelected =
    allLessonEntries.length > 0 && selectedLessonIds.size === allLessonEntries.length;
  const hasSelection = selectedLessonIds.size > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-5">
      {/* Header section with Stats & Push Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Projects</h1>
            <Badge variant="outline" className="text-mono-xs font-normal">
              {allLessonEntries.length} lessons • {totalFilesCount} files
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Files you've written per lesson. Select folders and push code directly to GitHub.
          </p>
        </div>

        {grouped.length > 0 ? (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleSelectAll}
              className="gap-1.5 text-xs"
            >
              {isAllSelected ? (
                <>
                  <Square className="size-3.5" /> Deselect All
                </>
              ) : (
                <>
                  <CheckSquare className="size-3.5" /> Select All
                </>
              )}
            </Button>
            <Button
              size="sm"
              onClick={handlePushSelected}
              className="gap-2 bg-primary hover:bg-primary/90 text-xs font-semibold shadow-sm"
            >
              <Github className="size-3.5" />
              {hasSelection
                ? `Push ${selectedLessonIds.size} Selected to GitHub`
                : "Push All to GitHub"}
            </Button>
          </div>
        ) : null}
      </div>

      {/* Search & Filter bar */}
      {grouped.length > 0 ? (
        <div className="relative">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search lessons, files (e.g. Main.java, Calculator), or courses..."
            className="h-9 pl-9 text-xs"
          />
        </div>
      ) : null}

      {grouped.length === 0 ? (
        <EmptyState
          icon={Code2}
          title="No project files yet"
          description="Open a lesson workspace and start writing code — files autosave per lesson and show up here."
        />
      ) : filteredGrouped.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-8 text-center text-sm text-muted-foreground">
          No lessons or files match "{searchQuery}"
        </div>
      ) : (
        <div className="space-y-6">
          {filteredGrouped.map((group) => {
            const courseLessonIds = group.lessons.map((l) => l.lesson.id);
            const courseAllSelected =
              courseLessonIds.length > 0 &&
              courseLessonIds.every((id) => selectedLessonIds.has(id));
            const courseSomeSelected =
              !courseAllSelected && courseLessonIds.some((id) => selectedLessonIds.has(id));

            return (
              <section
                key={group.course.id}
                className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm"
              >
                {/* Course Header with Course-level Checkbox & Push Button */}
                <div className="flex items-center justify-between border-b border-border bg-elevated/30 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={courseAllSelected ? true : courseSomeSelected ? "indeterminate" : false}
                      onCheckedChange={() => toggleCourse(group.lessons)}
                      aria-label={`Select all in ${group.course.title}`}
                    />
                    <Link
                      to="/course/$courseId"
                      params={{ courseId: group.course.id }}
                      className="text-sm font-semibold text-foreground hover:text-primary transition"
                    >
                      {group.course.title}
                    </Link>
                    <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0">
                      {group.lessons.length} {group.lessons.length === 1 ? "lesson" : "lessons"}
                    </Badge>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handlePushCourse(group)}
                    className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Github className="size-3" />
                    Push Course
                  </Button>
                </div>

                {/* Lesson Rows with Checkbox and 1-Click Push Button */}
                <ul className="divide-y divide-border">
                  {group.lessons.map((entry) => {
                    const isSelected = selectedLessonIds.has(entry.lesson.id);

                    return (
                      <li
                        key={entry.lesson.id}
                        className={`px-4 py-3.5 transition-colors ${
                          isSelected ? "bg-primary/5" : "hover:bg-elevated/20"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleLesson(entry.lesson.id)}
                              aria-label={`Select ${entry.lesson.title}`}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <Link
                                  to="/course/$courseId/lesson/$lessonId"
                                  params={{ courseId: group.course.id, lessonId: entry.lesson.id }}
                                  className="truncate text-sm font-medium text-foreground hover:text-primary transition"
                                >
                                  {entry.lesson.position + 1}. {entry.lesson.title}
                                </Link>
                                {entry.versions.length > 0 ? (
                                  <span className="inline-flex items-center gap-1 text-mono-xs text-muted-foreground">
                                    <History className="size-3" /> {entry.versions.length} snapshots
                                  </span>
                                ) : null}
                              </div>

                              {/* Files Badges */}
                              <ul className="mt-2 flex flex-wrap gap-1.5">
                                {entry.files.map((file) => (
                                  <li
                                    key={file.id}
                                    className="inline-flex items-center gap-1.5 rounded border border-border bg-elevated/50 px-2 py-0.5 text-mono-xs text-muted-foreground"
                                  >
                                    <FileCode2 className="size-3 text-primary/80" />
                                    <span>{file.path}</span>
                                    <span className="opacity-50 text-[10px]">
                                      {formatRelative(file.updated_at)}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>

                          {/* Quick 1-click Push this Lesson Button */}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePushSingleLesson(entry)}
                            className="h-7 shrink-0 gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary/50"
                          >
                            <Github className="size-3" />
                            Push
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {/* Push to GitHub Modal */}
      <ProjectsPushModal
        open={pushModalOpen}
        onOpenChange={setPushModalOpen}
        selectedItems={modalItems}
        defaultCourseTitle={modalCourseTitle}
      />
    </div>
  );
}
