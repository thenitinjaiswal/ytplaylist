import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import {
  BookOpen,
  Code2,
  FileText,
  Github,
  LayoutDashboard,
  Plus,
  Scissors,
  Settings,
  User,
} from "lucide-react";
export function CommandPalette({ open, onOpenChange, actions = [] }) {
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  useEffect(() => {
    if (!open) setTerm("");
  }, [open]);
  const search = useQuery({
    queryKey: ["palette-search", term],
    enabled: open && term.trim().length >= 2,
    staleTime: 15_000,
    queryFn: async () => {
      const like = `%${term.trim()}%`;
      const [courses, lessons, notes, snippets] = await Promise.all([
        supabase.from("courses").select("id, title, channel_title").ilike("title", like).limit(5),
        supabase
          .from("lessons")
          .select("id, title, course_id, position")
          .ilike("title", like)
          .limit(6),
        supabase
          .from("notes")
          .select("id, title, lesson_id, course_id")
          .ilike("title", like)
          .limit(5),
        supabase.from("snippets").select("id, title, language").ilike("title", like).limit(4),
      ]);
      return {
        courses: courses.data ?? [],
        lessons: lessons.data ?? [],
        notes: notes.data ?? [],
        snippets: snippets.data ?? [],
      };
    },
  });
  const go = (fn) => {
    onOpenChange(false);
    fn();
  };
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search courses, lessons, notes — or run a command…"
        value={term}
        onValueChange={setTerm}
      />
      <CommandList className="scroll-thin">
        <CommandEmpty>No results found.</CommandEmpty>

        {actions.length > 0 ? (
          <>
            <CommandGroup heading="This screen">
              {actions.map((action) => (
                <CommandItem key={action.id} onSelect={() => go(action.run)}>
                  <Code2 className="mr-2 size-4" />
                  {action.label}
                  {action.shortcut ? (
                    <span className="ml-auto text-mono-xs text-muted-foreground">
                      {action.shortcut}
                    </span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        ) : null}

        <CommandGroup heading="Navigate">
          <CommandItem onSelect={() => go(() => navigate({ to: "/dashboard" }))}>
            <LayoutDashboard className="mr-2 size-4" /> Dashboard
          </CommandItem>
          <CommandItem onSelect={() => go(() => navigate({ to: "/courses" }))}>
            <BookOpen className="mr-2 size-4" /> My courses
          </CommandItem>
          <CommandItem onSelect={() => go(() => navigate({ to: "/courses/new" }))}>
            <Plus className="mr-2 size-4" /> Import YouTube playlist
          </CommandItem>
          <CommandItem onSelect={() => go(() => navigate({ to: "/notes" }))}>
            <FileText className="mr-2 size-4" /> Notes
          </CommandItem>
          <CommandItem onSelect={() => go(() => navigate({ to: "/projects" }))}>
            <Code2 className="mr-2 size-4" /> Projects
          </CommandItem>
          <CommandItem onSelect={() => go(() => navigate({ to: "/github" }))}>
            <Github className="mr-2 size-4" /> GitHub
          </CommandItem>
          <CommandItem onSelect={() => go(() => navigate({ to: "/settings" }))}>
            <Settings className="mr-2 size-4" /> Settings
          </CommandItem>
          <CommandItem onSelect={() => go(() => navigate({ to: "/profile" }))}>
            <User className="mr-2 size-4" /> Profile
          </CommandItem>
        </CommandGroup>

        {search.data?.courses.length ? (
          <CommandGroup heading="Courses">
            {search.data.courses.map((course) => (
              <CommandItem
                key={course.id}
                value={`course-${course.id}-${course.title}`}
                onSelect={() =>
                  go(() => navigate({ to: "/course/$courseId", params: { courseId: course.id } }))
                }
              >
                <BookOpen className="mr-2 size-4" />
                <span className="truncate">{course.title}</span>
                <span className="ml-auto truncate text-xs text-muted-foreground">
                  {course.channel_title}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {search.data?.lessons.length ? (
          <CommandGroup heading="Lessons">
            {search.data.lessons.map((lesson) => (
              <CommandItem
                key={lesson.id}
                value={`lesson-${lesson.id}-${lesson.title}`}
                onSelect={() =>
                  go(() =>
                    navigate({
                      to: "/course/$courseId/lesson/$lessonId",
                      params: { courseId: lesson.course_id, lessonId: lesson.id },
                    }),
                  )
                }
              >
                <Code2 className="mr-2 size-4" />
                <span className="truncate">{lesson.title}</span>
                <span className="ml-auto text-mono-xs text-muted-foreground">
                  #{lesson.position + 1}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {search.data?.notes.length ? (
          <CommandGroup heading="Notes">
            {search.data.notes.map((note) => (
              <CommandItem
                key={note.id}
                value={`note-${note.id}-${note.title}`}
                onSelect={() => go(() => navigate({ to: "/notes", search: { note: note.id } }))}
              >
                <FileText className="mr-2 size-4" />
                <span className="truncate">{note.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {search.data?.snippets.length ? (
          <CommandGroup heading="Snippets">
            {search.data.snippets.map((snippet) => (
              <CommandItem
                key={snippet.id}
                value={`snippet-${snippet.id}-${snippet.title}`}
                onSelect={() => go(() => navigate({ to: "/notes", search: { tab: "snippets" } }))}
              >
                <Scissors className="mr-2 size-4" />
                <span className="truncate">{snippet.title}</span>
                <span className="ml-auto text-mono-xs text-muted-foreground">
                  {snippet.language}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}
/** Global Ctrl/Cmd+K listener that does not fight Monaco's own shortcuts. */
export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const handler = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  return { open, setOpen };
}
