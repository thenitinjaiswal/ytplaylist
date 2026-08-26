import { ChevronRight, Maximize2, Minimize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
function IconAction({ label, onClick, children }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-6 text-muted-foreground hover:text-foreground"
          aria-label={label}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
export function PanelFrame({
  title,
  icon,
  actions,
  meta,
  maximized,
  onMaximize,
  collapsed,
  onToggleCollapse,
  onHide,
  className,
  bodyClassName,
  children,
}) {
  return (
    <section
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface",
        className,
      )}
      aria-label={title}
    >
      <header className="flex h-9 shrink-0 items-center gap-1.5 border-b border-border px-2">
        {onToggleCollapse ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronRight
              className={cn("size-3.5 transition-transform", collapsed ? "" : "rotate-90")}
            />
          </button>
        ) : null}
        {icon ? <span className="text-muted-foreground">{icon}</span> : null}
        <span className="truncate text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          {title}
        </span>
        {meta ? <span className="truncate text-mono-xs text-muted-foreground">{meta}</span> : null}
        <div className="min-w-2 flex-1" />
        <div className="flex shrink-0 items-center gap-1">
          {actions}
          {onMaximize ? (
            <IconAction
              label={maximized ? `Restore layout` : `Maximize ${title}`}
              onClick={onMaximize}
            >
              {maximized ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
            </IconAction>
          ) : null}
          {onHide ? (
            <IconAction label={`Hide ${title}`} onClick={onHide}>
              <X className="size-3.5" />
            </IconAction>
          ) : null}
        </div>
      </header>
      <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden", bodyClassName)}>
        {collapsed ? null : children}
      </div>
    </section>
  );
}
