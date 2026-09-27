import { Group, Panel, Separator } from "react-resizable-panels";
import { cn } from "@/lib/utils";
const ResizablePanelGroup = ({ className, orientation = "horizontal", ...props }) => (
  <Group
    orientation={orientation}
    className={cn(
      "flex h-full min-h-0 w-full min-w-0",
      orientation === "vertical" ? "flex-col" : "flex-row",
      className,
    )}
    {...props}
  />
);
const ResizablePanel = Panel;
/**
 * Drag handle with a hit area larger than the visible line. Pointer-event based
 * (mouse, trackpad, touch) via react-resizable-panels, with a subtle highlight.
 * `orientation` must match the parent group's orientation.
 */
const ResizableHandle = ({ className, orientation = "horizontal", ...props }) => {
  const vertical = orientation === "vertical";
  return (
    <Separator
      className={cn(
        "group/handle relative z-10 flex shrink-0 select-none items-center justify-center bg-transparent outline-none",
        vertical ? "h-2 w-full cursor-row-resize" : "h-full w-2 cursor-col-resize",
        "touch-none focus-visible:ring-1 focus-visible:ring-ring",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute bg-border transition-colors group-hover/handle:bg-primary/70 group-active/handle:bg-primary",
          vertical
            ? "inset-x-0 top-1/2 h-px -translate-y-1/2"
            : "inset-y-0 left-1/2 w-px -translate-x-1/2",
        )}
      />
      <span
        aria-hidden
        className={cn(
          "pointer-events-none relative rounded-full bg-muted-foreground/50 opacity-0 transition-opacity group-hover/handle:opacity-100",
          vertical ? "h-0.5 w-8" : "h-8 w-0.5",
        )}
      />
    </Separator>
  );
};
export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
