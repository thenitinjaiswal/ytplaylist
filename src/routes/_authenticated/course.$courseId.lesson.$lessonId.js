import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  Globe,
  Code2,
  Expand,
  Gauge,
  ListVideo,
  Maximize,
  NotebookPen,
  RotateCcw,
  Youtube,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { detectLanguage, getLanguage } from "@/lib/languages";
import { normalizeSpeed, PLAYBACK_SPEEDS } from "@/lib/study-plan";
import {
  applyMode,
  clampWindow,
  clearCanvas,
  defaultCanvas,
  loadCanvas,
  MODE_LABELS,
  saveCanvas,
  topZ,
  WINDOW_LABELS,
} from "@/lib/ide/canvas";
import { CodeIDE } from "@/components/ide/code-ide";
import { FloatingWindow, SnapPreview } from "@/components/ide/floating-window";
import { BrowserPanel } from "@/components/ide/browser-panel";
import { LessonSidebar } from "@/components/ide/lesson-sidebar";
import { NotesPanel } from "@/components/ide/notes-panel";
import { WorkspaceVideo } from "@/components/ide/workspace-video";
import { useRegisterPaletteActions } from "@/hooks/use-palette-actions";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
export const Route = createFileRoute("/_authenticated/course/$courseId/lesson/$lessonId")({
  validateSearch: z.object({ t: z.number().optional() }),
  head: () => ({
    meta: [
      { title: "Lesson workspace — CodeStudy" },
      {
        name: "description",
        content:
          "A free-form IDE canvas: the lesson video is the background, the code editor, terminal and notes float as movable windows.",
      },
      { property: "og:title", content: "Lesson workspace — CodeStudy" },
      {
        property: "og:description",
        content: "Drag, resize, snap and stack your video, code, terminal and notes windows.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WorkspacePage,
});
const WINDOW_ICONS = {
  video: Youtube,
  code: Code2,
  notes: NotebookPen,
  lessons: ListVideo,
  browser: Globe,
};
function WorkspacePage() {
  const { courseId, lessonId } = Route.useParams();
  const search = Route.useSearch();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [notes, setNotes] = useState("");
  const [pane, setPane] = useState("video");
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const [canvas, setCanvas] = useState(null);
  const [snap, setSnap] = useState(null);
  const [resetOpen, setResetOpen] = useState(false);
  const rootRef = useRef(null);
  const shellRef = useRef(null);
  const ideApi = useRef(null);
  const videoApi = useRef(null);
  /* ------------------------------------------------------- canvas geometry */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => setBounds({ width: root.clientWidth, height: root.clientHeight });
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    measure();
    return () => observer.disconnect();
  }, [isMobile]);
  /* restore the saved layout (or build the default one) once we know the size */
  useEffect(() => {
    if (canvas || isMobile || !bounds.width || !bounds.height) return;
    const stored = loadCanvas(lessonId);
    const next = stored ?? defaultCanvas(bounds);
    setCanvas({
      ...next,
      windows: Object.fromEntries(
        Object.keys(next.windows).map((key) => [key, clampWindow(next.windows[key], key, bounds)]),
      ),
    });
  }, [bounds, canvas, isMobile, lessonId]);
  const commitCanvas = useCallback(
    (updater) => {
      setCanvas((prev) => {
        if (!prev) return prev;
        const next = updater(prev);
        saveCanvas(lessonId, next);
        return next;
      });
    },
    [lessonId],
  );
  const patchWindow = useCallback(
    (key, patch) => {
      commitCanvas((prev) => ({
        ...prev,
        mode: "free",
        windows: {
          ...prev.windows,
          [key]: clampWindow({ ...prev.windows[key], ...patch }, key, bounds),
        },
      }));
    },
    [bounds, commitCanvas],
  );
  const bringToFront = useCallback(
    (key) => {
      commitCanvas((prev) => {
        const highest = topZ(prev);
        if (prev.windows[key].z === highest) return prev;
        return {
          ...prev,
          windows: { ...prev.windows, [key]: { ...prev.windows[key], z: highest + 1 } },
        };
      });
    },
    [commitCanvas],
  );
  const toggleVisible = useCallback(
    (key) => {
      commitCanvas((prev) => {
        const target = prev.windows[key];
        const highest = topZ(prev);
        return {
          ...prev,
          windows: {
            ...prev.windows,
            [key]: target.visible
              ? { ...target, visible: false }
              : { ...target, visible: true, minimized: false, z: highest + 1 },
          },
        };
      });
    },
    [commitCanvas],
  );
  const toggleMaximize = useCallback(
    (key) => {
      commitCanvas((prev) => {
        const target = prev.windows[key];
        const highest = topZ(prev);
        if (target.maximized) {
          const restore = target.restore;
          return {
            ...prev,
            windows: {
              ...prev.windows,
              [key]: {
                ...target,
                ...(restore ?? {}),
                maximized: false,
                restore: undefined,
              },
            },
          };
        }
        return {
          ...prev,
          windows: {
            ...prev.windows,
            [key]: {
              ...target,
              maximized: true,
              minimized: false,
              z: highest + 1,
              restore: { x: target.x, y: target.y, width: target.width, height: target.height },
            },
          },
          /* a maximised IDE turns the lesson video into a floating mini-player */
          videoBackground: key === "code" ? false : prev.videoBackground,
        };
      });
    },
    [commitCanvas],
  );
  const toggleMinimize = useCallback(
    (key) => {
      commitCanvas((prev) => {
        const target = prev.windows[key];
        const highest = topZ(prev);
        return {
          ...prev,
          windows: {
            ...prev.windows,
            [key]: target.minimized
              ? { ...target, minimized: false, z: highest + 1 }
              : { ...target, minimized: true, maximized: false },
          },
        };
      });
    },
    [commitCanvas],
  );
  const chooseMode = useCallback(
    (mode) => {
      commitCanvas((prev) => applyMode(prev, mode, bounds));
    },
    [bounds, commitCanvas],
  );
  const resetWorkspace = useCallback(() => {
    clearCanvas(lessonId);
    const fresh = defaultCanvas(bounds);
    setCanvas(fresh);
    saveCanvas(lessonId, fresh);
    setResetOpen(false);
    toast.success("Workspace layout reset");
  }, [bounds, lessonId]);
  const toggleFullscreen = useCallback(() => {
    const shell = shellRef.current;
    if (!shell) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void shell.requestFullscreen?.();
  }, []);
  /* ------------------------------------------------------------------ data */
  const query = useQuery({
    queryKey: ["workspace", lessonId],
    queryFn: async () => {
      const [lesson, note, progress, course, prefs] = await Promise.all([
        supabase.from("lessons").select("*").eq("id", lessonId).single(),
        supabase.from("notes").select("*").eq("lesson_id", lessonId).maybeSingle(),
        supabase.from("lesson_progress").select("*").eq("lesson_id", lessonId).maybeSingle(),
        supabase.from("courses").select("id, title").eq("id", courseId).maybeSingle(),
        supabase.from("preferences").select("*").maybeSingle(),
      ]);
      return {
        lesson: lesson.data,
        note: note.data,
        progress: progress.data,
        course: course.data,
        prefs: prefs.data,
      };
    },
  });
  const [speed, setSpeed] = useState(1);
  const savedSpeed = query.data?.prefs?.playback_speed;
  useEffect(() => {
    if (savedSpeed != null) {
      setSpeed(normalizeSpeed(savedSpeed));
    }
  }, [savedSpeed]);
  const updateSpeed = useMutation({
    mutationFn: async (newSpeed) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      await supabase
        .from("preferences")
        .upsert({ user_id: auth.user.id, playback_speed: newSpeed }, { onConflict: "user_id" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["preferences"] });
    },
  });
  const handleSpeedChange = (value) => {
    const nextSpeed = normalizeSpeed(Number(value));
    setSpeed(nextSpeed);
    updateSpeed.mutate(nextSpeed);
  };
  useEffect(() => {
    if (!query.data) return;
    setNotes(query.data.note?.content ?? "");
  }, [query.data]);
  const saveNotes = useMutation({
    mutationFn: async (silent) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");
      await supabase.from("notes").upsert(
        {
          user_id: auth.user.id,
          course_id: courseId,
          lesson_id: lessonId,
          title: query.data?.lesson?.title ?? "Lesson notes",
          content: notes,
          scope: "lesson",
        },
        { onConflict: "lesson_id" },
      );
      return silent;
    },
    onSuccess: (silent) => {
      if (!silent) toast.success("Notes saved");
    },
    onError: () => toast.error("Could not save your notes"),
  });
  /* notes autosave */
  const notesLoaded = useRef(false);
  useEffect(() => {
    if (!query.data) return;
    if (!notesLoaded.current) {
      notesLoaded.current = true;
      return;
    }
    const timer = setTimeout(() => saveNotes.mutate(true), 1200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes]);
  const complete = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");
      await supabase.from("lesson_progress").upsert(
        {
          user_id: auth.user.id,
          course_id: courseId,
          lesson_id: lessonId,
          completed: true,
          completed_at: new Date().toISOString(),
        },
        { onConflict: "user_id,lesson_id" },
      );
    },
    onSuccess: () => {
      toast.success("Lesson marked complete");
      queryClient.invalidateQueries({ queryKey: ["workspace", lessonId] });
      queryClient.invalidateQueries({ queryKey: ["lesson-sidebar", courseId] });
    },
  });
  /* ---------------------------------------------------------- keyboard map */
  useEffect(() => {
    const handler = (event) => {
      if (!event.altKey || event.ctrlKey || event.metaKey) return;
      const map = {
        1: () => chooseMode("video"),
        2: () => chooseMode("code"),
        3: () => chooseMode("notes"),
        4: () => chooseMode("free"),
        0: () => chooseMode("normal"),
        b: () => toggleVisible("lessons"),
        w: () => toggleVisible("browser"),
        j: () => ideApi.current?.toggleTerminal(),
        m: () => toggleMaximize("code"),
        p: () => commitCanvas((prev) => ({ ...prev, videoBackground: !prev.videoBackground })),
      };
      const action = map[event.key.toLowerCase()];
      if (!action) return;
      event.preventDefault();
      action();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [chooseMode, commitCanvas, toggleMaximize, toggleVisible]);
  const paletteActions = useMemo(
    () => [
      { id: "ws-run", label: "Run code", shortcut: "Ctrl+↵", run: () => ideApi.current?.run() },
      { id: "ws-save", label: "Save workspace", run: () => ideApi.current?.save() },
      {
        id: "ws-terminal",
        label: "Toggle terminal",
        shortcut: "Alt+J",
        run: () => ideApi.current?.toggleTerminal(),
      },
      { id: "ws-code", label: "Code focus mode", shortcut: "Alt+2", run: () => chooseMode("code") },
      {
        id: "ws-video",
        label: "Video focus mode",
        shortcut: "Alt+1",
        run: () => chooseMode("video"),
      },
      {
        id: "ws-notes",
        label: "Notes focus mode",
        shortcut: "Alt+3",
        run: () => chooseMode("notes"),
      },
      {
        id: "ws-free",
        label: "Free canvas mode",
        shortcut: "Alt+4",
        run: () => chooseMode("free"),
      },
      {
        id: "ws-browser",
        label: "Toggle in-app browser",
        shortcut: "Alt+W",
        run: () => toggleVisible("browser"),
      },
      { id: "ws-reset", label: "Reset workspace layout", run: () => setResetOpen(true) },
      { id: "ws-full", label: "Fullscreen workspace", run: toggleFullscreen },
      { id: "ws-complete", label: "Mark lesson complete", run: () => complete.mutate() },
    ],
    [chooseMode, complete, toggleFullscreen, toggleVisible],
  );
  useRegisterPaletteActions(paletteActions);
  const onApiReady = useCallback((api) => {
    ideApi.current = api;
  }, []);
  const onVideoApi = useCallback((api) => {
    videoApi.current = api;
  }, []);
  const getTimestamp = useCallback(() => videoApi.current?.getCurrentTime() ?? 0, []);
  if (query.isLoading) {
    return (
      <div className="space-y-3 p-5">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }
  const lesson = query.data?.lesson;
  const prefs = query.data?.prefs;
  const startAt = search.t ?? query.data?.progress?.watched_seconds ?? 0;
  const recommended =
    detectLanguage(lesson?.title, lesson?.description, query.data?.course?.title) ??
    getLanguage(prefs?.default_language ?? "java").id;
  const player = lesson?.video_id ? (
    <WorkspaceVideo
      videoId={lesson.video_id}
      startAt={startAt}
      title={lesson.title ?? "Lesson video"}
      playbackSpeed={speed}
      onApi={onVideoApi}
    />
  ) : (
    <div className="grid size-full place-items-center text-xs text-muted-foreground">
      No video for this lesson
    </div>
  );
  const notesPane = (bare) => (
    <NotesPanel
      value={notes}
      onChange={setNotes}
      onSave={() => saveNotes.mutate(false)}
      saving={saveNotes.isPending}
      getTimestamp={getTimestamp}
      bare={bare}
    />
  );
  const ide = (
    <CodeIDE
      courseId={courseId}
      lessonId={lessonId}
      lessonTitle={lesson?.title ?? "lesson"}
      recommendedLanguage={recommended}
      fontSize={prefs?.editor_font_size ?? 13}
      wordWrap={prefs?.word_wrap ?? true}
      minimap={prefs?.minimap ?? true}
      onApiReady={onApiReady}
    />
  );
  const toolbar = (
    <header className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-border px-3 py-2">
      <Link
        to="/course/$courseId"
        params={{ courseId }}
        className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
        aria-label="Back to course"
      >
        <ArrowLeft className="size-4" />
      </Link>
      <h1 className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
        {lesson?.title ?? "Lesson"}
      </h1>

      {isMobile ? null : (
        <>
          <div className="flex shrink-0 items-center gap-1 rounded-md border border-border p-0.5">
            {["lessons", "video", "code", "notes", "browser"].map((key) => {
              const Icon = WINDOW_ICONS[key];
              const active =
                key === "video"
                  ? Boolean(canvas?.videoBackground || canvas?.windows.video.visible)
                  : Boolean(canvas?.windows[key].visible);
              return (
                <Tooltip key={key}>
                  <TooltipTrigger asChild>
                    <Toggle
                      size="sm"
                      className="size-7 p-0"
                      pressed={active}
                      onPressedChange={() => toggleVisible(key)}
                      aria-label={`Toggle ${WINDOW_LABELS[key]} window`}
                    >
                      <Icon className="size-3.5" />
                    </Toggle>
                  </TooltipTrigger>
                  <TooltipContent>{WINDOW_LABELS[key]}</TooltipContent>
                </Tooltip>
              );
            })}
          </div>

          <Select value={String(speed)} onValueChange={handleSpeedChange}>
            <SelectTrigger className="h-8 w-[85px] shrink-0" aria-label="Playback speed">
              <Gauge className="mr-1 size-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLAYBACK_SPEEDS.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s}×
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={canvas?.mode ?? "normal"} onValueChange={(value) => chooseMode(value)}>
            <SelectTrigger className="h-8 w-[150px] shrink-0" aria-label="Workspace mode">
              <Expand className="mr-1 size-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.keys(MODE_LABELS).map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {MODE_LABELS[mode]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
                onClick={toggleFullscreen}
                aria-label="Fullscreen workspace"
              >
                <Maximize className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Fullscreen workspace</TooltipContent>
          </Tooltip>

          <Button
            size="sm"
            variant="ghost"
            className="shrink-0 gap-1.5"
            onClick={() => setResetOpen(true)}
          >
            <RotateCcw className="size-3.5" /> Reset
          </Button>
        </>
      )}

      <Button size="sm" className="shrink-0 gap-1.5" onClick={() => complete.mutate()}>
        <Check className="size-4" /> Complete
      </Button>
    </header>
  );
  /* ------------------------------------------------------------- rendering */
  if (isMobile) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] flex-col">
        {toolbar}
        <Tabs value={pane} onValueChange={setPane} className="flex min-h-0 flex-1 flex-col p-2">
          <TabsList className="w-full shrink-0">
            <TabsTrigger value="video" className="flex-1">
              Video
            </TabsTrigger>
            <TabsTrigger value="code" className="flex-1">
              Code
            </TabsTrigger>
            <TabsTrigger value="notes" className="flex-1">
              Notes
            </TabsTrigger>
            <TabsTrigger value="lessons" className="flex-1">
              Lessons
            </TabsTrigger>
            <TabsTrigger value="browser" className="flex-1">
              Browser
            </TabsTrigger>
          </TabsList>
          <TabsContent value="video" className="mt-2 min-h-0 flex-1">
            <div className="aspect-video overflow-hidden rounded-lg border border-border bg-black">
              {player}
            </div>
          </TabsContent>
          <TabsContent value="code" className="mt-2 flex min-h-0 flex-1 flex-col">
            {pane === "code" ? ide : null}
          </TabsContent>
          <TabsContent value="notes" className="mt-2 flex min-h-0 flex-1 flex-col">
            {notesPane(false)}
          </TabsContent>
          <TabsContent value="browser" className="mt-2 flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border">
              {pane === "browser" ? <BrowserPanel /> : null}
            </div>
          </TabsContent>
          <TabsContent value="lessons" className="mt-2 flex min-h-0 flex-1 flex-col">
            <LessonSidebar
              courseId={courseId}
              activeLessonId={lessonId}
              collapsed={false}
              onToggle={() => {}}
            />
          </TabsContent>
        </Tabs>
      </div>
    );
  }
  const windowProps = (key) => ({
    windowKey: key,
    state: canvas.windows[key],
    bounds,
    title: WINDOW_LABELS[key],
    onFocus: () => bringToFront(key),
    onCommit: (patch) => patchWindow(key, patch),
    onSnapPreview: setSnap,
    onMinimize: () => toggleMinimize(key),
    onMaximize: () => toggleMaximize(key),
    onClose: () => toggleVisible(key),
  });
  return (
    <div ref={shellRef} className="flex h-[calc(100vh-3.5rem)] flex-col bg-background">
      {toolbar}

      <div
        ref={rootRef}
        className="relative min-h-0 flex-1 overflow-hidden bg-[#07090c]"
        aria-label="Lesson workspace canvas"
      >
        {canvas ? (
          <>
            {/* Video: the background learning layer, or a floating mini-player. */}
            <FloatingWindow
              {...windowProps("video")}
              icon={<Youtube className="size-3.5" />}
              background={canvas.videoBackground}
              state={
                canvas.videoBackground
                  ? { ...canvas.windows.video, visible: true }
                  : canvas.windows.video
              }
              onClose={() => commitCanvas((prev) => ({ ...prev, videoBackground: true }))}
              actions={
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 text-xs"
                  onClick={() => commitCanvas((prev) => ({ ...prev, videoBackground: true }))}
                >
                  Dock as background
                </Button>
              }
              bodyClassName="bg-black"
            >
              {player}
            </FloatingWindow>

            {canvas.videoBackground ? (
              <div className="pointer-events-none absolute inset-x-0 top-2 z-[1] flex justify-center">
                <button
                  type="button"
                  className="pointer-events-auto rounded-full border border-border bg-surface/90 px-3 py-1 text-xs text-muted-foreground shadow-lg transition-colors hover:text-foreground"
                  onClick={() =>
                    commitCanvas((prev) => ({
                      ...prev,
                      videoBackground: false,
                      windows: {
                        ...prev.windows,
                        video: {
                          ...prev.windows.video,
                          visible: true,
                          minimized: false,
                          z: topZ(prev) + 1,
                        },
                      },
                    }))
                  }
                >
                  Pop video out as floating player
                </button>
              </div>
            ) : null}

            <FloatingWindow {...windowProps("code")} icon={<Code2 className="size-3.5" />}>
              {ide}
            </FloatingWindow>

            <FloatingWindow {...windowProps("notes")} icon={<NotebookPen className="size-3.5" />}>
              {notesPane(true)}
            </FloatingWindow>

            <FloatingWindow {...windowProps("lessons")} icon={<ListVideo className="size-3.5" />}>
              <LessonSidebar
                courseId={courseId}
                activeLessonId={lessonId}
                collapsed={false}
                onToggle={() => toggleMinimize("lessons")}
              />
            </FloatingWindow>

            <FloatingWindow {...windowProps("browser")} icon={<Globe className="size-3.5" />}>
              <BrowserPanel />
            </FloatingWindow>

            <SnapPreview zone={snap} bounds={bounds} />
          </>
        ) : null}
      </div>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset your workspace layout?</AlertDialogTitle>
            <AlertDialogDescription>
              Window positions, sizes and modes go back to the default arrangement. Your code and
              notes are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={resetWorkspace}>Reset workspace</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
