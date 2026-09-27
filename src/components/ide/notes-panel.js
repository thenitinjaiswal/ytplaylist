import { useRef, useState } from "react";
import {
  Clock,
  Code,
  Heading2,
  Image as ImageIcon,
  List,
  ListChecks,
  Loader2,
  NotebookPen,
  Save,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { renderMarkdown } from "@/lib/markdown";
import { uploadNoteImage } from "@/lib/notes-image";
import { PanelFrame } from "@/components/ide/panel-frame";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function stamp(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function NotesPanel({
  value,
  onChange,
  onSave,
  saving,
  status,
  getTimestamp,
  bare,
  maximized,
  onMaximize,
  onHide,
}) {
  const [tab, setTab] = useState("write");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const areaRef = useRef(null);
  const fileInputRef = useRef(null);

  const insert = (snippet) => {
    const area = areaRef.current;
    const at = area ? (area.selectionStart ?? value.length) : value.length;
    const before = value.slice(0, at);
    const after = value.slice(at);
    const prefix = before.length && !before.endsWith("\n") ? "\n" : "";
    const next = `${before}${prefix}${snippet}${after}`;
    onChange(next);
    setTab("write");
    requestAnimationFrame(() => {
      const caret = before.length + prefix.length + snippet.length;
      area?.focus();
      area?.setSelectionRange(caret, caret);
    });
  };

  const processAndInsertImage = async (file) => {
    if (!file || !file.type.startsWith("image/")) {
      toast.error("Please select a valid image file");
      return;
    }
    setUploadingImage(true);
    try {
      const { url, alt } = await uploadNoteImage(file);
      insert(`![${alt}](${url})\n`);
      toast.success("Image added to note!");
    } catch (err) {
      console.error("Failed to add image:", err);
      toast.error("Failed to process image");
    } finally {
      setUploadingImage(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      void processAndInsertImage(file);
    }
    // reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (file) {
          void processAndInsertImage(file);
        }
        return;
      }
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        if (files[i].type.startsWith("image/")) {
          void processAndInsertImage(files[i]);
          return;
        }
      }
    }
  };

  const tools = (
    <>
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
      {[
        {
          label: "Insert video timestamp",
          icon: <Clock className="size-3" />,
          run: () => insert(`- [${stamp(getTimestamp?.() ?? 0)}] `),
        },
        { label: "Heading", icon: <Heading2 className="size-3" />, run: () => insert("## ") },
        { label: "Bullet list", icon: <List className="size-3" />, run: () => insert("- ") },
        {
          label: "Checklist",
          icon: <ListChecks className="size-3" />,
          run: () => insert("- [ ] "),
        },
        {
          label: "Code snippet",
          icon: <Code className="size-3" />,
          run: () => insert("```java\n\n```\n"),
        },
      ].map((tool) => (
        <Tooltip key={tool.label}>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="size-6 text-muted-foreground hover:text-foreground"
              aria-label={tool.label}
              onClick={tool.run}
            >
              {tool.icon}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{tool.label}</TooltipContent>
        </Tooltip>
      ))}

      {/* Image Upload Button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="size-6 text-muted-foreground hover:text-foreground"
            aria-label="Upload / Attach image"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingImage}
          >
            {uploadingImage ? (
              <Loader2 className="size-3 animate-spin text-primary" />
            ) : (
              <ImageIcon className="size-3 text-emerald-400" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Upload image (or paste / drop into note)</TooltipContent>
      </Tooltip>

      <Button
        size="sm"
        variant="ghost"
        className="h-6 gap-1 px-1.5 text-xs"
        onClick={onSave}
        disabled={saving || uploadingImage}
      >
        {saving ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
        Save
      </Button>
      {uploadingImage ? (
        <span className="shrink-0 text-[10px] text-emerald-400 animate-pulse font-mono">
          Uploading image...
        </span>
      ) : status ? (
        <span className="shrink-0 text-mono-xs text-muted-foreground">{status}</span>
      ) : null}
    </>
  );

  const body = (
    <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
      <TabsList className="mx-2 mt-2 h-7 w-fit shrink-0">
        <TabsTrigger value="write" className="text-xs">
          Write
        </TabsTrigger>
        <TabsTrigger value="preview" className="text-xs">
          Preview
        </TabsTrigger>
      </TabsList>
      <TabsContent value="write" className="mt-2 min-h-0 flex-1 px-2 pb-2">
        <div
          className={`relative h-full w-full rounded-md transition ${
            isDraggingOver ? "ring-2 ring-primary ring-offset-1 bg-primary/5" : ""
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingOver(true);
          }}
          onDragLeave={() => setIsDraggingOver(false)}
          onDrop={handleDrop}
        >
          <Textarea
            ref={areaRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onPaste={handlePaste}
            placeholder="Write markdown notes for this lesson... (Paste images directly with Ctrl+V or click Image button)"
            className="h-full min-h-0 resize-none border-border bg-transparent font-mono text-sm leading-relaxed"
          />
          {uploadingImage ? (
            <div className="absolute inset-0 flex items-center justify-center bg-surface/70 backdrop-blur-xs rounded-md">
              <div className="flex items-center gap-2 text-xs font-medium text-foreground bg-elevated px-3 py-1.5 rounded-md border border-border shadow-md">
                <Loader2 className="size-4 animate-spin text-primary" />
                Processing image...
              </div>
            </div>
          ) : null}
        </div>
      </TabsContent>
      <TabsContent value="preview" className="mt-2 min-h-0 flex-1 overflow-auto px-3 pb-3">
        <div className="prose-note" dangerouslySetInnerHTML={{ __html: renderMarkdown(value) }} />
      </TabsContent>
    </Tabs>
  );

  if (bare) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border px-2 py-1">
          {tools}
        </div>
        {body}
      </div>
    );
  }

  return (
    <PanelFrame
      title="Notes"
      icon={<NotebookPen className="size-3.5" />}
      maximized={maximized}
      onMaximize={onMaximize}
      onHide={onHide}
      actions={tools}
    >
      {body}
    </PanelFrame>
  );
}
