import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { Clock, Download, FileText, ImagePlus, Loader2, Plus, Scissors, Trash2 } from "lucide-react";
import { zipSync, strToU8 } from "fflate";
import { supabase } from "@/integrations/supabase/client";
import { renderMarkdown } from "@/lib/markdown";
import { formatClock, formatRelative } from "@/lib/format";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// ── Local draft helpers ────────────────────────────────────────────────────────
const DRAFT_KEY = (id) => `codestudy:note-draft:${id}`;
function saveDraft(id, draft) {
  try { localStorage.setItem(DRAFT_KEY(id), JSON.stringify(draft)); } catch (_) {}
}
function loadDraft(id) {
  try { const raw = localStorage.getItem(DRAFT_KEY(id)); return raw ? JSON.parse(raw) : null; } catch (_) { return null; }
}
function clearDraft(id) {
  try { localStorage.removeItem(DRAFT_KEY(id)); } catch (_) {}
}

// ── Export helpers ─────────────────────────────────────────────────────────────
function safeName(title) {
  return (title || "untitled").replace(/[/\\?%*:|"<>]/g, "-").trim().slice(0, 80);
}
function exportAllAsZip(notes, courseTitle) {
  if (!notes.length) { toast.error("No notes to export"); return; }
  const files = {};
  const seen = {};
  notes.forEach((note) => {
    const base = safeName(note.title);
    const count = seen[base] = (seen[base] ?? 0) + 1;
    const name = count > 1 ? `${base} (${count}).md` : `${base}.md`;
    const header = [
      `# ${note.title || "Untitled"}`,
      `> Course: ${courseTitle(note.course_id)}`,
      `> Saved: ${new Date(note.updated_at).toLocaleString()}`,
      "",
    ].join("\n");
    files[name] = strToU8(header + (note.content || ""));
  });
  const zipped = zipSync(files);
  const blob = new Blob([zipped], { type: "application/zip" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `LearnFlow-Notes-${new Date().toISOString().slice(0, 10)}.zip`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast.success(`✅ ${notes.length} notes exported as ZIP!`);
}

/**
 * Compress an image via canvas.
 * - Uses WebP if the browser supports it (≈50% smaller than JPEG).
 * - Downscales to max 900px on the longest side.
 * - Quality 0.72 — sharp enough for notes, aggressively small.
 * Returns { blob, mime, ext, originalKB, compressedKB }.
 */
async function compressImage(file) {
  const originalKB = Math.round(file.size / 1024);
  // Guard: reject obviously non-image or huge files early
  if (file.size > 20 * 1024 * 1024) throw new Error("File too large (max 20 MB original)");
  const supportsWebP = await new Promise((res) => {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    res(c.toDataURL("image/webp").startsWith("data:image/webp"));
  });
  const mime = supportsWebP ? "image/webp" : "image/jpeg";
  const ext  = supportsWebP ? "webp" : "jpg";
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 900;
      const longest = Math.max(img.width, img.height);
      const scale = longest > MAX ? MAX / longest : 1;
      const canvas = document.createElement("canvas");
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve({ blob, mime, ext, originalKB, compressedKB: Math.round(blob.size / 1024) })
            : reject(new Error("Canvas toBlob failed")),
        mime,
        0.72,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load failed")); };
    img.src = url;
  });
}
const searchSchema = z.object({
  note: z.string().optional(),
  tab: z.enum(["notes", "snippets", "timestamps"]).optional(),
});
export const Route = createFileRoute("/_authenticated/notes")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Notes — CodeStudy" },
      {
        name: "description",
        content: "All of your markdown notes, timestamped video notes and saved code snippets.",
      },
      { property: "og:title", content: "Notes — CodeStudy" },
      { property: "og:description", content: "Markdown notes, timestamps and snippets." },
    ],
  }),
  component: NotesPage,
});
function NotesPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState(search.note ?? null);
  const [draft, setDraft] = useState(null);
  const [hasLocalDraft, setHasLocalDraft] = useState(false);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const query = useQuery({
    queryKey: ["notes-page"],
    queryFn: async () => {
      const [notes, snippets, timestamps, courses] = await Promise.all([
        supabase.from("notes").select("*").order("updated_at", { ascending: false }),
        supabase.from("snippets").select("*").order("created_at", { ascending: false }),
        supabase
          .from("timestamp_notes")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase.from("courses").select("id, title"),
      ]);
      return {
        notes: notes.data ?? [],
        snippets: snippets.data ?? [],
        timestamps: timestamps.data ?? [],
        courses: courses.data ?? [],
      };
    },
  });
  const notes = query.data?.notes ?? [];
  const active = useMemo(
    () => notes.find((note) => note.id === activeId) ?? notes[0] ?? null,
    [notes, activeId],
  );
  // Restore from Supabase on note switch; prefer local unsaved draft if one exists
  useEffect(() => {
    if (!active) return;
    const local = loadDraft(active.id);
    if (local) {
      setDraft(local);
      setHasLocalDraft(true);
    } else {
      setDraft({ title: active.title, content: active.content });
      setHasLocalDraft(false);
    }
  }, [active?.id]);
  const save = useMutation({
    mutationFn: async () => {
      if (!active || !draft) return;
      const { error } = await supabase
        .from("notes")
        .update({ title: draft.title, content: draft.content })
        .eq("id", active.id);
      if (error) throw error;
    },
    onSuccess: () => {
      clearDraft(active?.id);
      setHasLocalDraft(false);
      toast.success("Note saved to cloud");
      queryClient.invalidateQueries({ queryKey: ["notes-page"] });
    },
    onError: () => toast.error("Could not save that note"),
  });
  const create = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("notes")
        .insert({ user_id: auth.user.id, title: "Untitled note", scope: "global" })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => {
      setActiveId(id);
      queryClient.invalidateQueries({ queryKey: ["notes-page"] });
    },
  });
  const remove = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setActiveId(null);
      queryClient.invalidateQueries({ queryKey: ["notes-page"] });
    },
  });
  const removeSnippet = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("snippets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notes-page"] }),
  });
  const uploadImage = useMutation({
    mutationFn: async (file) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");
      const { blob, mime, ext, originalKB, compressedKB } = await compressImage(file);
      const path = `${auth.user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("note-images")
        .upload(path, blob, { contentType: mime, upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("note-images").getPublicUrl(path);
      return { url: pub.publicUrl, originalKB, compressedKB };
    },
    onSuccess: ({ url, originalKB, compressedKB }) => {
      const area = textareaRef.current;
      const at = area ? (area.selectionStart ?? (draft?.content ?? "").length) : (draft?.content ?? "").length;
      const content = draft?.content ?? "";
      const before = content.slice(0, at);
      const after = content.slice(at);
      const prefix = before.length && !before.endsWith("\n") ? "\n" : "";
      const snippet = `![image](${url})`;
      setDraft((d) => ({ ...d, content: `${before}${prefix}${snippet}${after}` }));
      const saved = Math.round((1 - compressedKB / originalKB) * 100);
      toast.success(`✅ Image inserted! ${originalKB} KB → ${compressedKB} KB (${saved}% saved)`);
    },
    onError: (err) => toast.error(`Image upload failed: ${err.message}`),
  });

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    uploadImage.mutate(file);
  };

  const courseTitle = (id) =>
    query.data?.courses.find((course) => course.id === id)?.title ?? "General";
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-5">
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Notes</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Markdown notes, video timestamps and saved snippets across every course.
            </p>
          </div>
          {notes.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => exportAllAsZip(notes, courseTitle)}
                >
                  <Download className="size-4" />
                  Export ZIP
                </Button>
              </TooltipTrigger>
              <TooltipContent>Download all notes as .md files in a ZIP</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      <Tabs
        value={search.tab ?? "notes"}
        onValueChange={(value) =>
          navigate({
            search: (prev) => ({ ...prev, tab: value }),
          })
        }
      >
        <TabsList>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="timestamps">Timestamps</TabsTrigger>
          <TabsTrigger value="snippets">Snippets</TabsTrigger>
        </TabsList>

        <TabsContent value="notes" className="mt-5">
          {notes.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No notes yet"
              description="Notes you write in a lesson workspace show up here, or start a general note."
              action={
                <Button size="sm" className="gap-2" onClick={() => create.mutate()}>
                  <Plus className="size-4" /> New note
                </Button>
              }
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
              <div className="rounded-lg border border-border bg-surface">
                <div className="flex items-center justify-between border-b border-border px-3 py-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {notes.length} notes
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    onClick={() => create.mutate()}
                    aria-label="New note"
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>
                <ScrollArea className="max-h-[32rem]">
                  <ul className="divide-y divide-border">
                    {notes.map((note) => (
                      <li key={note.id}>
                        <button
                          type="button"
                          onClick={() => setActiveId(note.id)}
                          className={cn(
                            "w-full px-3 py-2.5 text-left transition-colors hover:bg-elevated/60",
                            active?.id === note.id && "bg-elevated",
                          )}
                        >
                          <span className="line-clamp-1 text-sm text-foreground">{note.title}</span>
                          <span className="text-mono-xs text-muted-foreground">
                            {courseTitle(note.course_id)} · {formatRelative(note.updated_at)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </div>

              {active && draft ? (
                <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
                  <div className="flex gap-2">
                    <Input
                      value={draft.title}
                      onChange={(event) => {
                        const next = { ...draft, title: event.target.value };
                        setDraft(next);
                        saveDraft(active.id, next);
                        setHasLocalDraft(true);
                      }}
                      className="text-base font-semibold"
                    />
                    <Button onClick={() => save.mutate()} disabled={save.isPending}>
                      Save
                    </Button>
                    {hasLocalDraft && (
                      <span className="flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-1 text-xs font-medium text-amber-600">
                        ● Unsaved local draft
                      </span>
                    )}
                    {/* Hidden file input for image upload */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      id="note-image-upload"
                      onChange={handleFileChange}
                    />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Upload image"
                          disabled={uploadImage.isPending}
                          onClick={() => fileInputRef.current?.click()}
                        >
                          {uploadImage.isPending ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <ImagePlus className="size-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Upload & insert image (auto-compressed)</TooltipContent>
                    </Tooltip>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete note"
                      onClick={() => remove.mutate(active.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <Textarea
                    ref={textareaRef}
                    value={draft.content}
                    onChange={(event) => {
                      const next = { ...draft, content: event.target.value };
                      setDraft(next);
                      saveDraft(active.id, next);
                      setHasLocalDraft(true);
                    }}
                    placeholder="Write markdown… # heading, - list, ```code```"
                    className="min-h-56 font-mono text-sm"
                  />
                  <div className="rounded-md border border-border bg-elevated/40 p-4">
                    <p className="mb-3 text-mono-xs uppercase tracking-widest text-muted-foreground">
                      Preview
                    </p>
                    <div
                      className="prose-note"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(draft.content) }}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </TabsContent>

        <TabsContent value="timestamps" className="mt-5">
          {(query.data?.timestamps.length ?? 0) === 0 ? (
            <EmptyState
              icon={Clock}
              title="No timestamped notes"
              description="While watching a lesson, capture a note at the current moment and it will appear here."
            />
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
              {query.data?.timestamps.map((note) => (
                <li key={note.id} className="flex items-start gap-3 px-4 py-3">
                  <Link
                    to="/course/$courseId/lesson/$lessonId"
                    params={{ courseId: note.course_id, lessonId: note.lesson_id }}
                    search={{ t: note.seconds }}
                    className="shrink-0 rounded bg-elevated px-2 py-1 text-mono-xs text-primary"
                  >
                    {formatClock(note.seconds)}
                  </Link>
                  <p className="min-w-0 flex-1 text-sm text-foreground">{note.body}</p>
                  <span className="shrink-0 text-mono-xs text-muted-foreground">
                    {formatRelative(note.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="snippets" className="mt-5">
          {(query.data?.snippets.length ?? 0) === 0 ? (
            <EmptyState
              icon={Scissors}
              title="No snippets saved"
              description="Save a selection from the editor as a snippet to build your own reference library."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {query.data?.snippets.map((snippet) => (
                <div key={snippet.id} className="rounded-lg border border-border bg-surface">
                  <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                      {snippet.title}
                    </span>
                    <span className="text-mono-xs text-muted-foreground">{snippet.language}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      aria-label="Delete snippet"
                      onClick={() => removeSnippet.mutate(snippet.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                  <pre className="scroll-thin max-h-56 overflow-auto p-4 text-mono-xs text-foreground">
                    {snippet.code}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
