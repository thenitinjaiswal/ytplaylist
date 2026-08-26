import { useCallback, useEffect, useRef } from "react";
import { Maximize2, Minimize2, Minus, X } from "lucide-react";
import { clamp, KEEP_VISIBLE, MIN_SIZE, rectForZone, snapZoneFor } from "@/lib/ide/canvas";
import { cn } from "@/lib/utils";
export const MINIMIZED_SIZE = { width: 260, height: 36 };
const HANDLES = [
  { handle: "n", className: "left-3 right-3 -top-1 h-2", cursor: "cursor-ns-resize" },
  { handle: "s", className: "left-3 right-3 -bottom-1 h-2", cursor: "cursor-ns-resize" },
  { handle: "w", className: "top-3 bottom-3 -left-1 w-2", cursor: "cursor-ew-resize" },
  { handle: "e", className: "top-3 bottom-3 -right-1 w-2", cursor: "cursor-ew-resize" },
  { handle: "nw", className: "-top-1 -left-1 size-3.5", cursor: "cursor-nwse-resize" },
  { handle: "se", className: "-bottom-1 -right-1 size-3.5", cursor: "cursor-nwse-resize" },
  { handle: "ne", className: "-top-1 -right-1 size-3.5", cursor: "cursor-nesw-resize" },
  { handle: "sw", className: "-bottom-1 -left-1 size-3.5", cursor: "cursor-nesw-resize" },
];
function rectOf(state, key, bounds, background) {
  if (background) return { x: 0, y: 0, width: bounds.width, height: bounds.height };
  if (state.maximized) return { x: 0, y: 0, width: bounds.width, height: bounds.height };
  if (state.minimized) {
    return {
      x: state.x,
      y: state.y,
      width: MINIMIZED_SIZE.width,
      height: MINIMIZED_SIZE.height,
    };
  }
  const min = MIN_SIZE[key];
  return {
    x: state.x,
    y: state.y,
    width: Math.max(state.width, min.width),
    height: Math.max(state.height, min.height),
  };
}
/**
 * A desktop-style floating window. Dragging and resizing mutate the element's
 * style directly inside pointer events, so React only re-renders once the
 * gesture ends — Monaco, the terminal and the YouTube iframe never remount.
 */
export function FloatingWindow({
  windowKey,
  state,
  bounds,
  title,
  icon,
  actions,
  background,
  onFocus,
  onCommit,
  onSnapPreview,
  onMinimize,
  onMaximize,
  onClose,
  bodyClassName,
  children,
}) {
  const elRef = useRef(null);
  const gesture = useRef(null);
  const liveRect = useRef(null);
  const frame = useRef(0);
  const zone = useRef(null);
  const isFloating = !background && !state.maximized;
  const rect = rectOf(state, windowKey, bounds, Boolean(background));
  /* keep the DOM in sync whenever React owns the rect again */
  useEffect(() => {
    const el = elRef.current;
    if (!el || gesture.current) return;
    el.style.left = `${rect.x}px`;
    el.style.top = `${rect.y}px`;
    el.style.width = `${rect.width}px`;
    el.style.height = `${rect.height}px`;
  }, [rect.x, rect.y, rect.width, rect.height]);
  const paint = useCallback(() => {
    frame.current = 0;
    const el = elRef.current;
    const next = liveRect.current;
    if (!el || !next) return;
    el.style.left = `${next.x}px`;
    el.style.top = `${next.y}px`;
    el.style.width = `${next.width}px`;
    el.style.height = `${next.height}px`;
  }, []);
  const begin = useCallback(
    (mode) => (event) => {
      if (background) return;
      if (event.button !== 0) return;
      if (mode === "move" && state.maximized) return;
      event.preventDefault();
      event.stopPropagation();
      onFocus();
      event.currentTarget.setPointerCapture(event.pointerId);
      gesture.current = {
        mode,
        startX: event.clientX,
        startY: event.clientY,
        from: { ...rect },
      };
      liveRect.current = { ...rect };
    },
    [background, onFocus, rect, state.maximized],
  );
  const move = useCallback(
    (event) => {
      const active = gesture.current;
      if (!active) return;
      const dx = event.clientX - active.startX;
      const dy = event.clientY - active.startY;
      const { from, mode } = active;
      const min = MIN_SIZE[windowKey];
      const next = { ...from };
      if (mode === "move") {
        next.x = clamp(
          from.x + dx,
          KEEP_VISIBLE - from.width,
          Math.max(0, bounds.width - KEEP_VISIBLE),
        );
        next.y = clamp(from.y + dy, 0, Math.max(0, bounds.height - 40));
        const host = elRef.current?.parentElement?.getBoundingClientRect();
        const pointer = host
          ? { x: event.clientX - host.left, y: event.clientY - host.top }
          : { x: next.x, y: next.y };
        const found = state.minimized ? null : snapZoneFor(pointer, bounds);
        if (found !== zone.current) {
          zone.current = found;
          onSnapPreview?.(found);
        }
      } else {
        if (mode.includes("e")) next.width = Math.max(min.width, from.width + dx);
        if (mode.includes("s")) next.height = Math.max(min.height, from.height + dy);
        if (mode.includes("w")) {
          const width = Math.max(min.width, from.width - dx);
          next.x = from.x + (from.width - width);
          next.width = width;
        }
        if (mode.includes("n")) {
          const height = Math.max(min.height, from.height - dy);
          next.y = from.y + (from.height - height);
          next.height = height;
        }
        next.width = Math.min(next.width, bounds.width + from.width);
        next.height = Math.min(next.height, Math.max(min.height, bounds.height - next.y));
        next.y = Math.max(0, next.y);
      }
      liveRect.current = next;
      if (!frame.current) frame.current = requestAnimationFrame(paint);
    },
    [bounds, onSnapPreview, paint, state.minimized, windowKey],
  );
  const end = useCallback(() => {
    const active = gesture.current;
    gesture.current = null;
    if (frame.current) {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      paint();
    }
    if (!active) return;
    const snap = zone.current;
    zone.current = null;
    onSnapPreview?.(null);
    const next = liveRect.current ?? active.from;
    if (active.mode === "move" && snap) {
      const target = rectForZone(snap, bounds);
      onCommit({
        ...target,
        maximized: false,
        minimized: false,
        restore: { ...active.from },
      });
      return;
    }
    if (state.minimized) {
      onCommit({ x: next.x, y: next.y });
      return;
    }
    onCommit({ x: next.x, y: next.y, width: next.width, height: next.height });
  }, [bounds, onCommit, onSnapPreview, paint, state.minimized]);
  useEffect(
    () => () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    },
    [],
  );
  if (!state.visible && !background) return null;
  return (
    <section
      ref={elRef}
      aria-label={title}
      onPointerDown={background ? undefined : onFocus}
      className={cn(
        "absolute flex flex-col overflow-hidden",
        background
          ? "z-0 bg-black"
          : "rounded-lg border border-border bg-surface shadow-2xl shadow-black/50 ring-1 ring-black/20",
      )}
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        zIndex: background ? 0 : state.z,
      }}
    >
      <header
        className={cn(
          "flex h-9 shrink-0 items-center gap-1.5 border-b border-border bg-surface px-2 select-none",
          background && "hidden",
          isFloating && "cursor-grab active:cursor-grabbing",
        )}
        onPointerDown={begin("move")}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onDoubleClick={onMaximize}
      >
        <span className="grid size-4 shrink-0 place-items-center text-muted-foreground">
          {icon}
        </span>
        <span className="truncate text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
          {title}
        </span>
        {state.minimized ? null : (
          <div
            className="flex min-w-0 flex-1 items-center gap-1 pl-1"
            onPointerDown={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            {actions}
          </div>
        )}
        <div
          className="ml-auto flex shrink-0 items-center gap-0.5"
          onPointerDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          {onMinimize ? (
            <button
              type="button"
              aria-label={state.minimized ? `Restore ${title}` : `Minimize ${title}`}
              onClick={onMinimize}
              className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {state.minimized ? (
                <Maximize2 className="size-3.5" />
              ) : (
                <Minus className="size-3.5" />
              )}
            </button>
          ) : null}
          {onMaximize && !state.minimized ? (
            <button
              type="button"
              aria-label={state.maximized ? `Restore ${title}` : `Maximize ${title}`}
              onClick={onMaximize}
              className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {state.maximized ? (
                <Minimize2 className="size-3.5" />
              ) : (
                <Maximize2 className="size-3.5" />
              )}
            </button>
          ) : null}
          {onClose ? (
            <button
              type="button"
              aria-label={`Close ${title}`}
              onClick={onClose}
              className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
      </header>

      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
          state.minimized && !background && "hidden",
          bodyClassName,
        )}
      >
        {children}
      </div>

      {isFloating && !state.minimized
        ? HANDLES.map(({ handle, className, cursor }) => (
            <div
              key={handle}
              role="presentation"
              aria-label={`Resize ${title} ${handle}`}
              className={cn("absolute z-10 touch-none", className, cursor)}
              onPointerDown={begin(handle)}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
            />
          ))
        : null}
    </section>
  );
}
export function SnapPreview({ zone, bounds }) {
  if (!zone) return null;
  const rect = rectForZone(zone, bounds);
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute z-[500] rounded-lg border-2 border-primary/70 bg-primary/10 transition-all duration-100"
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
    />
  );
}
