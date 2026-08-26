import { cn } from "@/lib/utils";
export function ProgressBar({ value, className, tone = "primary" }) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-elevated", className)}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500",
          tone === "success" ? "bg-success" : "bg-primary",
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
