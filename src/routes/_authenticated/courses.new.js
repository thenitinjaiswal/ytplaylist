import { useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Loader2, Youtube } from "lucide-react";
import { toast } from "sonner";
import { previewPlaylist, importCourse } from "@/lib/youtube.functions";
import {
  MAX_DAILY_CAP_MINUTES,
  MAX_TARGET_DAYS,
  MIN_DAILY_CAP_MINUTES,
  planSummary,
  suggestedCapMinutes,
  summarizeCapPlan,
} from "@/lib/study-plan";
import { formatDuration } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
export const Route = createFileRoute("/_authenticated/courses/new")({
  head: () => ({
    meta: [
      { title: "Import a playlist — CodeStudy" },
      {
        name: "description",
        content:
          "Paste a public YouTube playlist URL to import it as a CodeStudy course with lessons and durations.",
      },
      { property: "og:title", content: "Import a playlist — CodeStudy" },
      { property: "og:description", content: "Turn a YouTube playlist into a structured course." },
    ],
  }),
  component: ImportPage,
});
function ImportPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const preview = useServerFn(previewPlaylist);
  const runImport = useServerFn(importCourse);
  const [url, setUrl] = useState("");
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [targetDays, setTargetDays] = useState("");
  const [hoursPerDay, setHoursPerDay] = useState("2");
  const previewMutation = useMutation({
    mutationFn: async (value) => preview({ data: { url: value } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setData(result.preview);
      setSelected(
        new Set(result.preview.videos.filter((v) => !v.unavailable).map((v) => v.videoId)),
      );
    },
    onError: () => toast.error("Could not read that playlist"),
  });
  const parsedDays = Number.parseInt(targetDays, 10);
  const validDays =
    Number.isFinite(parsedDays) && parsedDays >= 1 && parsedDays <= MAX_TARGET_DAYS
      ? parsedDays
      : null;
  const parsedHours = Number.parseFloat(hoursPerDay);
  const capMinutes =
    Number.isFinite(parsedHours) && parsedHours > 0
      ? Math.min(
          MAX_DAILY_CAP_MINUTES,
          Math.max(MIN_DAILY_CAP_MINUTES, Math.round(parsedHours * 60)),
        )
      : null;
  const importMutation = useMutation({
    mutationFn: async () => {
      if (!data) throw new Error("No playlist loaded");
      return runImport({
        data: {
          playlistId: data.playlistId,
          videoIds: [...selected],
          targetDays: validDays,
          dailyCapMinutes: capMinutes,
        },
      });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["courses-with-progress"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Course imported");
      navigate({ to: "/course/$courseId", params: { courseId: result.courseId } });
    },
    onError: () => toast.error("Import failed. Please try again."),
  });
  const selectedVideos = data?.videos.filter((v) => selected.has(v.videoId)) ?? [];
  const totalSelectedSeconds = selectedVideos.reduce((s, v) => s + v.durationSeconds, 0);
  const schedulable = selectedVideos.map((v) => ({
    id: v.videoId,
    duration_seconds: v.durationSeconds,
  }));
  const capPlan =
    capMinutes && schedulable.length > 0 ? summarizeCapPlan(schedulable, capMinutes * 60) : null;
  const overTarget = capPlan && validDays ? capPlan.daysNeeded > validDays : false;
  const neededHoursPerDay =
    overTarget && validDays ? suggestedCapMinutes(schedulable, validDays) : null;
  const planPreview =
    !capMinutes && validDays && schedulable.length > 0 ? planSummary(schedulable, validDays) : null;
  function toggle(videoId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(videoId)) next.delete(videoId);
      else next.add(videoId);
      return next;
    });
  }
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-5">
      <Link
        to="/courses"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Courses
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Import a playlist</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste a public YouTube playlist URL. Private and unlisted playlists can't be read by the
          YouTube API.
        </p>
      </div>

      <form
        className="space-y-3 rounded-lg border border-border bg-surface p-5"
        onSubmit={(event) => {
          event.preventDefault();
          previewMutation.mutate(url);
        }}
      >
        <Label htmlFor="playlist">Playlist URL</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Youtube className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="playlist"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://www.youtube.com/playlist?list=PL…"
              className="pl-9"
              required
            />
          </div>
          <Button type="submit" disabled={previewMutation.isPending}>
            {previewMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Load playlist
          </Button>
        </div>
      </form>

      {data ? (
        <section className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="flex flex-wrap gap-4 border-b border-border p-5">
            {data.thumbnail ? (
              <img
                src={data.thumbnail}
                alt={data.title}
                className="h-24 w-40 rounded-md object-cover"
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold text-foreground">{data.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{data.channelTitle}</p>
              <p className="mt-2 text-mono-xs text-muted-foreground">
                {data.videos.length} videos · {formatDuration(data.totalSeconds)} total
              </p>
              {data.existingCourseId ? (
                <p className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-warning/10 px-2 py-1 text-xs text-warning">
                  <AlertTriangle className="size-3.5" /> You already imported this playlist —
                  importing again creates a second copy.
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <p className="text-sm text-muted-foreground">
              {selected.size} selected · {formatDuration(totalSelectedSeconds)}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setSelected(
                    new Set(data.videos.filter((v) => !v.unavailable).map((v) => v.videoId)),
                  )
                }
              >
                Select all
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelected(new Set())}
              >
                Clear
              </Button>
            </div>
          </div>

          <ScrollArea className="max-h-[26rem]">
            <ul className="divide-y divide-border">
              {data.videos.map((video, index) => (
                <li key={video.videoId} className="flex items-center gap-3 px-5 py-3">
                  <Checkbox
                    id={video.videoId}
                    checked={selected.has(video.videoId)}
                    disabled={video.unavailable}
                    onCheckedChange={() => toggle(video.videoId)}
                  />
                  <span className="w-7 shrink-0 text-mono-xs text-muted-foreground">
                    {index + 1}
                  </span>
                  <label htmlFor={video.videoId} className="min-w-0 flex-1 cursor-pointer">
                    <span className="line-clamp-1 text-sm text-foreground">{video.title}</span>
                    {video.unavailable ? (
                      <span className="text-mono-xs text-destructive">
                        unavailable — can't be embedded
                      </span>
                    ) : null}
                  </label>
                  <span className="shrink-0 text-mono-xs text-muted-foreground">
                    {formatDuration(video.durationSeconds)}
                  </span>
                </li>
              ))}
            </ul>
          </ScrollArea>

          <div className="space-y-4 border-t border-border p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="hours-per-day">Hours available per day</Label>
                <Input
                  id="hours-per-day"
                  type="number"
                  min={0.25}
                  max={24}
                  step={0.25}
                  inputMode="decimal"
                  value={hoursPerDay}
                  onChange={(event) => setHoursPerDay(event.target.value)}
                  placeholder="e.g. 2"
                  className="w-40"
                />
                <p className="text-xs text-muted-foreground">
                  Hard cap per day. A video is never split — if it doesn't fit, it starts the next
                  day.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="target-days">Target days to finish (optional)</Label>
                <Input
                  id="target-days"
                  type="number"
                  min={1}
                  max={MAX_TARGET_DAYS}
                  inputMode="numeric"
                  value={targetDays}
                  onChange={(event) => setTargetDays(event.target.value)}
                  placeholder="e.g. 20"
                  className="w-40"
                />
                <p className="text-xs text-muted-foreground">
                  {capPlan
                    ? `At this pace: ${capPlan.daysNeeded} study days.`
                    : planPreview
                      ? `${planPreview.days} study days · ~${formatDuration(planPreview.averageSeconds)} per day.`
                      : "Only a goal — the hours/day cap decides the split."}
                </p>
              </div>
            </div>

            {capPlan ? (
              <div className="rounded-md border border-border bg-elevated p-3 text-sm">
                <p className="text-foreground">
                  {capPlan.daysNeeded} days · up to {formatDuration(capPlan.capSeconds)} per day ·{" "}
                  {formatDuration(capPlan.totalSeconds)} total
                </p>
                {overTarget && validDays ? (
                  <div className="mt-2 flex gap-2 rounded-md bg-warning/10 p-2.5 text-xs text-warning">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    <div className="space-y-2">
                      <p>
                        At {hoursPerDay} hrs/day this playlist takes{" "}
                        <strong>{capPlan.daysNeeded} days</strong>, not {validDays}. Give more time
                        per day or extend the deadline.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {neededHoursPerDay ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setHoursPerDay(
                                (neededHoursPerDay / 60).toFixed(2).replace(/\.?0+$/, ""),
                              )
                            }
                          >
                            Use {(neededHoursPerDay / 60).toFixed(1)} hrs/day
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setTargetDays(String(capPlan.daysNeeded))}
                        >
                          Accept {capPlan.daysNeeded} days
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="flex justify-end">
              <Button
                onClick={() => importMutation.mutate()}
                disabled={selected.size === 0 || importMutation.isPending}
              >
                {importMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Import {selected.size} lessons
              </Button>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
