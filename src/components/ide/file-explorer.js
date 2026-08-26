import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  File as FileIcon,
  FilePlus,
  Folder,
  FolderPlus,
  Pencil,
  Trash2,
} from "lucide-react";
import { buildTree } from "@/lib/ide/workspace";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
export function FileExplorer({
  paths,
  activePath,
  entryPath,
  onOpen,
  onCreateFile,
  onCreateFolder,
  onRename,
  onDelete,
  onDuplicate,
}) {
  const [collapsed, setCollapsed] = useState({});
  const tree = buildTree(paths);
  const renderNodes = (nodes, depth) =>
    nodes.map((node) => {
      if (node.type === "folder") {
        const isCollapsed = collapsed[node.path] ?? false;
        return (
          <div key={`dir-${node.path}`}>
            <button
              type="button"
              onClick={() => setCollapsed((c) => ({ ...c, [node.path]: !isCollapsed }))}
              className="group flex w-full items-center gap-1 rounded px-1.5 py-1 text-left text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              style={{ paddingLeft: depth * 10 + 6 }}
            >
              {isCollapsed ? (
                <ChevronRight className="size-3.5 shrink-0" />
              ) : (
                <ChevronDown className="size-3.5 shrink-0" />
              )}
              <Folder className="size-3.5 shrink-0" />
              <span className="truncate">{node.name}</span>
              <span className="ml-auto hidden shrink-0 items-center gap-0.5 group-hover:flex">
                <FilePlus
                  className="size-3.5 hover:text-foreground"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCreateFile(node.path);
                  }}
                />
              </span>
            </button>
            {!isCollapsed ? renderNodes(node.children, depth + 1) : null}
          </div>
        );
      }
      const isActive = node.path === activePath;
      return (
        <div
          key={`file-${node.path}`}
          className={cn(
            "group flex items-center gap-1 rounded px-1.5 py-1 text-xs",
            isActive ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60",
          )}
          style={{ paddingLeft: depth * 10 + 6 }}
        >
          <button
            type="button"
            onClick={() => onOpen(node.path)}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          >
            <FileIcon className="size-3.5 shrink-0" />
            <span className="truncate">{node.name}</span>
            {node.path === entryPath ? (
              <span className="shrink-0 rounded bg-primary/15 px-1 text-[10px] text-primary">
                entry
              </span>
            ) : null}
          </button>
          <span className="hidden shrink-0 items-center gap-1 group-hover:flex">
            <button
              type="button"
              aria-label={`Rename ${node.name}`}
              onClick={() => onRename(node.path)}
            >
              <Pencil className="size-3 hover:text-foreground" />
            </button>
            <button
              type="button"
              aria-label={`Duplicate ${node.name}`}
              onClick={() => onDuplicate(node.path)}
            >
              <Copy className="size-3 hover:text-foreground" />
            </button>
            <button
              type="button"
              aria-label={`Delete ${node.name}`}
              onClick={() => onDelete(node.path)}
            >
              <Trash2 className="size-3 hover:text-destructive" />
            </button>
          </span>
        </div>
      );
    });
  return (
    <div className="flex min-h-0 w-full flex-col border-border bg-surface md:w-52 md:border-r">
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
        <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          Files
        </span>
        <div className="flex-1" />
        <Button
          size="icon"
          variant="ghost"
          className="size-6"
          aria-label="New file"
          onClick={() => onCreateFile("")}
        >
          <FilePlus className="size-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-6"
          aria-label="New folder"
          onClick={() => onCreateFolder("")}
        >
          <FolderPlus className="size-3.5" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto py-1">{renderNodes(tree, 0)}</div>
    </div>
  );
}
