import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Check,
  Download,
  Github,
  History,
  Loader2,
  Maximize2,
  Minimize2,
  PanelLeft,
  Play,
  RotateCcw,
  Save,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getRuntimeVersion, runCode } from "@/lib/execute.functions";
import { PushToGithubModal } from "@/components/push-to-github-modal";
import {
  RUNNABLE_LANGUAGES,
  ENABLED_LANGUAGES,
  getLanguage,
  monacoLanguageForPath,
} from "@/lib/languages";
import {
  clearDraft,
  downloadWorkspaceZip,
  loadDraft,
  parseErrorLocations,
  saveDraft,
  sortFiles,
  starterWorkspace,
  validateWorkspacePath,
} from "@/lib/ide/workspace";
import { loadLayout, saveLayout } from "@/lib/ide/layout";
import { FileExplorer } from "@/components/ide/file-explorer";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { OutputPanel } from "@/components/ide/output-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { cn } from "@/lib/utils";
export function CodeIDE({
  courseId,
  lessonId,
  lessonTitle,
  recommendedLanguage,
  fontSize = 13,
  wordWrap = true,
  minimap = true,
  maximized,
  onMaximize,
  onApiReady,
}) {
  const queryClient = useQueryClient();
  const execute = useServerFn(runCode);
  const probeVersion = useServerFn(getRuntimeVersion);
  const [language, setLanguage] = useState(recommendedLanguage);
  const [workspaces, setWorkspaces] = useState({});
  const [openTabs, setOpenTabs] = useState([]);
  const [activePath, setActivePath] = useState("");
  const [stdin, setStdin] = useState("");
  const [result, setResult] = useState(null);
  const [outputTab, setOutputTab] = useState("output");
  const [saveState, setSaveState] = useState("idle");
  const [prompt, setPrompt] = useState(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [githubPushOpen, setGithubPushOpen] = useState(false);
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [terminalOpen, setTerminalOpen] = useState(true);
  const explorerPanel = useRef(null);
  const terminalPanel = useRef(null);
  const [innerLayout] = useState(() => loadLayout("ide-body"));
  const saveInnerLayout = useCallback((layout) => saveLayout("ide-body", layout), []);
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const loadedRef = useRef(false);
  const savedSnapshot = useRef("");
  const config = getLanguage(language);
  const files = useMemo(() => workspaces[language] ?? [], [workspaces, language]);
  const paths = useMemo(() => files.map((f) => f.path), [files]);
  const activeFile = files.find((f) => f.path === activePath) ?? files[0] ?? null;
  const entryPath = files.some((f) => f.path === config.entryFile)
    ? config.entryFile
    : (files.find((f) => f.path.endsWith(`.${config.extension}`))?.path ?? files[0]?.path ?? "");
  /* ---------------------------------------------------------------- loading */
  const stored = useQuery({
    queryKey: ["ide-files", lessonId],
    queryFn: async () => {
      const { data } = await supabase
        .from("code_files")
        .select("path, content, language")
        .eq("lesson_id", lessonId);
      return data ?? [];
    },
  });
  useEffect(() => {
    if (!stored.data || loadedRef.current) return;
    loadedRef.current = true;
    const next = {};
    for (const row of stored.data) {
      const bucket = (next[row.language] ??= []);
      bucket.push({ path: row.path, content: row.content });
    }
    for (const lang of ENABLED_LANGUAGES) {
      const draft = loadDraft(lessonId, lang.id);
      if (draft && draft.length > 0 && !next[lang.id]) next[lang.id] = draft;
    }
    const initial = next[recommendedLanguage]?.length
      ? recommendedLanguage
      : (Object.keys(next).find((key) => next[key]?.length) ?? recommendedLanguage);
    if (!next[initial]?.length) next[initial] = starterWorkspace(initial);
    setWorkspaces(next);
    setLanguage(initial);
    const first = getLanguage(initial).entryFile;
    const openPath = next[initial].some((f) => f.path === first) ? first : next[initial][0].path;
    setActivePath(openPath);
    setOpenTabs([openPath]);
    savedSnapshot.current = JSON.stringify(next);
  }, [stored.data, lessonId, recommendedLanguage]);
  const runtimeVersion = useQuery({
    queryKey: ["runtime-version", language],
    enabled: !config.preview,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => (await probeVersion({ data: { language } })).version,
  });
  /* ----------------------------------------------------------------- saving */
  const persist = useCallback(
    async (snapshot, langId) => {
      const list = snapshot[langId] ?? [];
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");
      const rows = list.map((file) => ({
        user_id: auth.user.id,
        course_id: courseId,
        lesson_id: lessonId,
        language: langId,
        path: file.path,
        content: file.content,
      }));
      if (rows.length > 0) {
        const { error } = await supabase
          .from("code_files")
          .upsert(rows, { onConflict: "user_id,lesson_id,language,path" });
        if (error) throw error;
      }
      const keep = list.map((f) => f.path);
      const { data: existing } = await supabase
        .from("code_files")
        .select("id, path")
        .eq("lesson_id", lessonId)
        .eq("language", langId);
      const stale = (existing ?? []).filter((row) => !keep.includes(row.path));
      if (stale.length > 0) {
        await supabase
          .from("code_files")
          .delete()
          .in(
            "id",
            stale.map((row) => row.id),
          );
      }
    },
    [courseId, lessonId],
  );
  const save = useCallback(
    async (langId, snapshot) => {
      setSaveState("saving");
      try {
        await persist(snapshot, langId);
        savedSnapshot.current = JSON.stringify(snapshot);
        clearDraft(lessonId, langId);
        setSaveState("saved");
      } catch (error) {
        console.error("workspace save failed", error);
        saveDraft(lessonId, langId, snapshot[langId] ?? []);
        setSaveState("offline");
      }
    },
    [persist, lessonId],
  );
  // Debounced autosave.
  useEffect(() => {
    if (!loadedRef.current || files.length === 0) return;
    if (JSON.stringify(workspaces) === savedSnapshot.current) return;
    setSaveState("dirty");
    const timer = setTimeout(() => void save(language, workspaces), 1500);
    return () => clearTimeout(timer);
  }, [workspaces, files.length, language, save]);
  // Save on unload / unmount.
  const latest = useRef({ workspaces, language });
  latest.current = { workspaces, language };
  useEffect(() => {
    const flush = () => {
      const { workspaces: ws, language: lang } = latest.current;
      if (JSON.stringify(ws) !== savedSnapshot.current) saveDraft(lessonId, lang, ws[lang] ?? []);
    };
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
      const { workspaces: ws, language: lang } = latest.current;
      if (JSON.stringify(ws) !== savedSnapshot.current) void persist(ws, lang).catch(() => {});
    };
  }, [lessonId, persist]);
  /* ------------------------------------------------------------ file ops */
  const updateFiles = (langId, updater) =>
    setWorkspaces((prev) => ({ ...prev, [langId]: sortFiles(updater(prev[langId] ?? [])) }));
  const openFile = (path) => {
    setActivePath(path);
    setOpenTabs((tabs) => (tabs.includes(path) ? tabs : [...tabs, path]));
  };
  const closeTab = (path) => {
    setOpenTabs((tabs) => {
      const next = tabs.filter((t) => t !== path);
      if (path === activePath) setActivePath(next[next.length - 1] ?? paths[0] ?? "");
      return next;
    });
  };
  const submitPrompt = () => {
    if (!prompt) return;
    const raw = prompt.value.trim();
    if (prompt.mode === "folder") {
      const folder = raw.replace(/\/+$/, "");
      const placeholder = `${folder}/.gitkeep`;
      const problem = validateWorkspacePath(placeholder, paths);
      if (problem) {
        toast.error(problem);
        return;
      }
      updateFiles(language, (list) => [...list, { path: placeholder, content: "" }]);
      setPrompt(null);
      return;
    }
    if (prompt.mode === "file") {
      const target = prompt.target ? `${prompt.target}/${raw}` : raw;
      const problem = validateWorkspacePath(target, paths);
      if (problem) {
        toast.error(problem);
        return;
      }
      updateFiles(language, (list) => [...list, { path: target, content: "" }]);
      openFile(target);
      setPrompt(null);
      return;
    }
    const problem = validateWorkspacePath(
      raw,
      paths.filter((p) => p !== prompt.target),
    );
    if (problem) {
      toast.error(problem);
      return;
    }
    updateFiles(language, (list) =>
      list.map((f) => (f.path === prompt.target ? { ...f, path: raw } : f)),
    );
    setOpenTabs((tabs) => tabs.map((t) => (t === prompt.target ? raw : t)));
    if (activePath === prompt.target) setActivePath(raw);
    setPrompt(null);
  };
  const deleteFile = (path) => {
    if (files.length <= 1) {
      toast.error("A workspace needs at least one file");
      return;
    }
    updateFiles(language, (list) => list.filter((f) => f.path !== path));
    closeTab(path);
  };
  const duplicateFile = (path) => {
    const source = files.find((f) => f.path === path);
    if (!source) return;
    const dot = path.lastIndexOf(".");
    const candidate = dot > 0 ? `${path.slice(0, dot)}-copy${path.slice(dot)}` : `${path}-copy`;
    if (paths.includes(candidate)) {
      toast.error("Copy already exists");
      return;
    }
    updateFiles(language, (list) => [...list, { path: candidate, content: source.content }]);
    openFile(candidate);
  };
  /* --------------------------------------------------------- language swap */
  const switchLanguage = (next) => {
    void save(language, workspaces);
    setWorkspaces((prev) => {
      if (prev[next]?.length) return prev;
      return { ...prev, [next]: starterWorkspace(next) };
    });
    setLanguage(next);
    setResult(null);
    const target = getLanguage(next);
    const existing = workspaces[next];
    const openPath = existing?.length
      ? (existing.find((f) => f.path === target.entryFile)?.path ?? existing[0].path)
      : target.entryFile;
    setActivePath(openPath);
    setOpenTabs([openPath]);
  };
  /* ------------------------------------------------------------------- run */
  const run = useMutation({
    mutationFn: async () => {
      if (config.preview) return null;
      return execute({
        data: {
          language,
          entry: entryPath,
          files,
          ...(stdin ? { stdin } : {}),
          lessonId,
        },
      });
    },
    onMutate: () => {
      setResult(null);
      setOutputTab("output");
    },
    onSuccess: (data) => {
      if (!data) return;
      setResult(data);
      applyMarkers(data);
      if (data.status === "compile_error" || data.status === "runtime_error") {
        setOutputTab("errors");
      }
    },
    onError: () => toast.error("Run failed — please try again"),
  });
  const applyMarkers = (run) => {
    const monaco = monacoRef.current;
    const editor = editorRef.current;
    if (!monaco || !editor) return;
    const model = editor.getModel();
    if (!model) return;
    monaco.editor.setModelMarkers(model, "sandbox", []);
    const text = [run.compileOutput, run.stderr].filter(Boolean).join("\n");
    const locations = parseErrorLocations(text, paths).filter((l) => l.file === activePath);
    if (locations.length === 0) return;
    monaco.editor.setModelMarkers(
      model,
      "sandbox",
      locations.map((loc) => ({
        severity: monaco.MarkerSeverity.Error,
        message: text.split("\n").find((line) => line.includes(`:${loc.line}`)) ?? "Error",
        startLineNumber: loc.line,
        endLineNumber: loc.line,
        startColumn: loc.column ?? 1,
        endColumn: 200,
      })),
    );
  };
  const jumpTo = (file, line) => {
    openFile(file);
    requestAnimationFrame(() => {
      editorRef.current?.revealLineInCenter(line);
      editorRef.current?.setPosition({ lineNumber: line, column: 1 });
      editorRef.current?.focus();
    });
  };
  /* -------------------------------------------------------- version history */
  const versions = useQuery({
    queryKey: ["code-versions", lessonId],
    enabled: historyOpen,
    queryFn: async () => {
      const { data } = await supabase
        .from("code_versions")
        .select("id, label, files, created_at")
        .eq("lesson_id", lessonId)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });
  const snapshotVersion = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");
      const { count } = await supabase
        .from("code_versions")
        .select("id", { count: "exact", head: true })
        .eq("lesson_id", lessonId);
      await supabase.from("code_versions").insert({
        user_id: auth.user.id,
        lesson_id: lessonId,
        label: `Version ${(count ?? 0) + 1}`,
        files: { language, files },
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["code-versions", lessonId] }),
  });
  const saveNow = async () => {
    await save(language, workspaces);
    await snapshotVersion.mutateAsync().catch(() => {});
    toast.success("Workspace saved");
  };
  const restoreVersion = async (payload) => {
    const parsed = payload;
    if (!parsed?.files?.length) {
      toast.error("This version has no files");
      return;
    }
    const langId = parsed.language ?? language;
    await snapshotVersion.mutateAsync().catch(() => {});
    setWorkspaces((prev) => ({ ...prev, [langId]: sortFiles(parsed.files) }));
    setLanguage(langId);
    setActivePath(parsed.files[0].path);
    setOpenTabs([parsed.files[0].path]);
    setHistoryOpen(false);
    toast.success("Version restored");
  };
  const resetStarter = () => {
    setWorkspaces((prev) => ({ ...prev, [language]: starterWorkspace(language) }));
    const target = getLanguage(language).entryFile;
    setActivePath(target);
    setOpenTabs([target]);
    setResetOpen(false);
    toast.success("Starter code restored");
  };
  /* -------------------------------------------------- layout side effects */
  const commands = useRef({ run: () => {}, save: () => {} });
  commands.current = { run: () => run.mutate(), save: () => void saveNow() };
  useEffect(() => {
    const panel = explorerPanel.current;
    if (!panel) return;
    if (explorerOpen) panel.expand();
    else panel.collapse();
  }, [explorerOpen]);
  useEffect(() => {
    const panel = terminalPanel.current;
    if (!panel) return;
    if (terminalOpen) panel.expand();
    else panel.collapse();
  }, [terminalOpen]);
  useEffect(() => {
    if (!onApiReady) return;
    onApiReady({
      run: () => commands.current.run(),
      save: () => commands.current.save(),
      toggleTerminal: () => setTerminalOpen((prev) => !prev),
      toggleExplorer: () => setExplorerOpen((prev) => !prev),
    });
  }, [onApiReady]);
  /* ------------------------------------------------------------------- UI */
  const saveLabel = {
    idle: "",
    dirty: "Unsaved changes",
    saving: "Saving…",
    saved: "Saved ✓",
    offline: "Offline changes saved locally",
  };
  const previewDoc = config.preview ? (files.find((f) => f.path === entryPath)?.content ?? "") : "";
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-border px-2 py-1.5">
        <Button
          size="icon"
          variant="ghost"
          className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
          aria-label={explorerOpen ? "Hide file explorer" : "Show file explorer"}
          onClick={() => setExplorerOpen((prev) => !prev)}
        >
          <PanelLeft className="size-4" />
        </Button>
        <Select value={language} onValueChange={switchLanguage}>
          <SelectTrigger className="h-8 w-[168px] shrink-0" aria-label="Language">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ENABLED_LANGUAGES.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                <span className="mr-1.5">{item.icon}</span>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="shrink-0 text-mono-xs text-muted-foreground">
          {runtimeVersion.data ?? config.versionLabel}
        </span>
        <div className="flex-1" />
        <span className="shrink-0 text-mono-xs text-muted-foreground">{saveLabel[saveState]}</span>
        <Button
          size="sm"
          variant="ghost"
          className="shrink-0 gap-1.5"
          onClick={() => setHistoryOpen(true)}
        >
          <History className="size-3.5" /> History
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="shrink-0 gap-1.5"
          onClick={() => downloadWorkspaceZip(files, `${lessonTitle}-${language}`)}
        >
          <Download className="size-3.5" /> ZIP
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="shrink-0 gap-1.5"
          onClick={() => setResetOpen(true)}
        >
          <RotateCcw className="size-3.5" /> Reset
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 gap-1.5"
          onClick={() => setGithubPushOpen(true)}
        >
          <Github className="size-3.5" /> Push to GitHub
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 gap-1.5"
          onClick={() => void saveNow()}
        >
          <Save className="size-3.5" /> Save
        </Button>
        {config.preview ? null : (
          <Button
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={() => run.mutate()}
            disabled={run.isPending}
          >
            {run.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Play className="size-3.5" />
            )}
            {run.isPending ? "Running…" : "Run"}
          </Button>
        )}
        {onMaximize ? (
          <Button
            size="icon"
            variant="ghost"
            className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
            aria-label={maximized ? "Restore workspace layout" : "Maximize editor"}
            onClick={onMaximize}
          >
            {maximized ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </Button>
        ) : null}
      </div>

      <ResizablePanelGroup
        orientation="horizontal"
        id="ide-body"
        className="min-h-0 flex-1"
        {...(innerLayout ? { defaultLayout: innerLayout } : {})}
        onLayoutChanged={(layout) => saveInnerLayout(layout)}
      >
        <ResizablePanel
          id="explorer"
          panelRef={explorerPanel}
          collapsible
          collapsedSize={0}
          defaultSize="22"
          minSize={140}
          maxSize="40"
          className="min-w-0 overflow-hidden"
        >
          <FileExplorer
            paths={paths}
            activePath={activeFile?.path ?? ""}
            entryPath={entryPath}
            onOpen={openFile}
            onCreateFile={(folder) => setPrompt({ mode: "file", value: "", target: folder })}
            onCreateFolder={() => setPrompt({ mode: "folder", value: "" })}
            onRename={(path) => setPrompt({ mode: "rename", value: path, target: path })}
            onDelete={deleteFile}
            onDuplicate={duplicateFile}
          />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel id="editor-area" minSize={220} className="min-w-0">
          <ResizablePanelGroup orientation="vertical" id="ide-editor-terminal" className="min-h-0">
            <ResizablePanel id="editor" minSize={100} defaultSize="62" className="min-h-0">
              <div className="flex h-full min-h-0 flex-col">
                <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-1 py-1">
                  {openTabs.map((tab) => (
                    <div
                      key={tab}
                      className={cn(
                        "flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs",
                        tab === activeFile?.path
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:bg-muted/50",
                      )}
                    >
                      <button type="button" onClick={() => setActivePath(tab)}>
                        {tab.split("/").pop()}
                      </button>
                      <button
                        type="button"
                        aria-label={`Close ${tab}`}
                        onClick={() => closeTab(tab)}
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="min-h-0 flex-1">
                  {activeFile ? (
                    <Editor
                      theme="vs-dark"
                      path={`${lessonId}/${language}/${activeFile.path}`}
                      language={monacoLanguageForPath(activeFile.path)}
                      value={activeFile.content}
                      onMount={(editor, monaco) => {
                        editorRef.current = editor;
                        monacoRef.current = monaco;
                      }}
                      onChange={(value) =>
                        updateFiles(language, (list) =>
                          list.map((f) =>
                            f.path === activeFile.path ? { ...f, content: value ?? "" } : f,
                          ),
                        )
                      }
                      options={{
                        fontSize,
                        wordWrap: wordWrap ? "on" : "off",
                        minimap: { enabled: minimap },
                        folding: true,
                        matchBrackets: "always",
                        automaticLayout: true,
                        tabSize: 4,
                        scrollBeyondLastLine: false,
                        quickSuggestions: true,
                        suggestOnTriggerCharacters: true,
                      }}
                    />
                  ) : null}
                </div>
              </div>
            </ResizablePanel>
            <ResizableHandle orientation="vertical" />
            <ResizablePanel
              id="terminal"
              panelRef={terminalPanel}
              collapsible
              collapsedSize={0}
              defaultSize="38"
              minSize={90}
              className="min-h-0 overflow-hidden"
              onResize={(size) => setTerminalOpen(size.inPixels > 8)}
            >
              {config.preview ? (
                <iframe
                  title="HTML preview"
                  className="size-full border-0 bg-white"
                  sandbox="allow-scripts"
                  srcDoc={previewDoc}
                />
              ) : (
                <OutputPanel
                  result={result}
                  running={run.isPending}
                  stdin={stdin}
                  onStdinChange={setStdin}
                  paths={paths}
                  onJumpTo={jumpTo}
                  tab={outputTab}
                  onTabChange={setOutputTab}
                />
              )}
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>

      <Dialog open={prompt !== null} onOpenChange={(open) => (open ? null : setPrompt(null))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {prompt?.mode === "rename"
                ? "Rename file"
                : prompt?.mode === "folder"
                  ? "New folder"
                  : "New file"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="ide-path">Path</Label>
            <Input
              id="ide-path"
              autoFocus
              value={prompt?.value ?? ""}
              placeholder={prompt?.mode === "folder" ? "src" : `Utils.${config.extension}`}
              onChange={(event) =>
                setPrompt((prev) => (prev ? { ...prev, value: event.target.value } : prev))
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") submitPrompt();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPrompt(null)}>
              Cancel
            </Button>
            <Button onClick={submitPrompt} className="gap-1.5">
              <Check className="size-4" /> Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Version history</DialogTitle>
          </DialogHeader>
          <div className="max-h-80 space-y-2 overflow-auto">
            {(versions.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No versions yet — click Save to create one.
              </p>
            ) : null}
            {(versions.data ?? []).map((version) => {
              const payload = version.files;
              return (
                <div
                  key={version.id}
                  className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">{version.label}</p>
                    <p className="text-mono-xs text-muted-foreground">
                      {new Date(version.created_at).toLocaleString()} ·{" "}
                      {getLanguage(payload?.language).label} · {payload?.files?.length ?? 0} files
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => void restoreVersion(payload)}>
                    Restore
                  </Button>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to starter code?</AlertDialogTitle>
            <AlertDialogDescription>
              Your current {config.label} files for this lesson will be replaced with the starter
              project. Saved versions in history are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={resetStarter}>Reset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PushToGithubModal
        open={githubPushOpen}
        onOpenChange={setGithubPushOpen}
        files={files}
        lessonTitle={lessonTitle}
        lessonId={lessonId}
      />
    </div>
  );
}
export { RUNNABLE_LANGUAGES };
