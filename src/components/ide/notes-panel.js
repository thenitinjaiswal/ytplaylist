import { useRef, useState } from "react";
import { Clock, Code, Heading2, List, ListChecks, Loader2, NotebookPen, Save } from "lucide-react";
import { renderMarkdown } from "@/lib/markdown";
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
  const areaRef = useRef(null);
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
  const tools = (
    <>
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
      <Button
        size="sm"
        variant="ghost"
        className="h-6 gap-1 px-1.5 text-xs"
        onClick={onSave}
        disabled={saving}
      >
        {saving ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
        Save
      </Button>
      {status ? (
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
        <Textarea
          ref={areaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Write markdown notes for this lesson…"
          className="h-full min-h-0 resize-none border-border bg-transparent font-mono text-sm"
        />
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
