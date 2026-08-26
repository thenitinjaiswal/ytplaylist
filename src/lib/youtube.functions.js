import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { extractPlaylistId } from "./youtube";
import { parseIsoDuration } from "./format";
import {
  assignScheduledDays,
  MAX_DAILY_CAP_MINUTES,
  MAX_TARGET_DAYS,
  MIN_DAILY_CAP_MINUTES,
  packByDailyCap,
} from "./study-plan";
export class ImportError extends Error {
  constructor(message) {
    super(message);
    this.name = "ImportError";
  }
}
async function ytFetch(path, params, apiKey) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("key", apiKey);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let res;
  try {
    res = await fetch(url, { signal: controller.signal });
  } catch (error) {
    console.error("youtube fetch failed", path, error);
    throw new ImportError("Could not reach YouTube. Please try again.");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const reason = body?.error?.errors?.[0]?.reason ?? "";
    console.error("youtube api error", res.status, reason, body?.error?.message);
    if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
      throw new ImportError("The YouTube API daily quota has been reached. Try again later.");
    }
    if (reason === "playlistNotFound" || res.status === 404) {
      throw new ImportError("This playlist is private or unavailable.");
    }
    if (res.status === 403) {
      throw new ImportError("YouTube rejected the request. Check the API key configuration.");
    }
    throw new ImportError("YouTube returned an unexpected error. Please try again.");
  }
  return res.json();
}
function readApiKey() {
  // Server-only. Either name works; GOOGLE_API_KEY is the shared Google Cloud key.
  const key =
    process.env["YOUTUBE_API_KEY"] ||
    process.env["GOOGLE_API_KEY"] ||
    process.env["VITE_YOUTUBE_API_KEY"] ||
    "AIzaSyCa1JRsLsVMyoddgJfwfeCz7k_MGrBlYBc";
  return key;
}
async function loadPlaylist(playlistId) {
  const apiKey = readApiKey();
  const meta = await ytFetch(
    "playlists",
    { part: "snippet,contentDetails", id: playlistId, maxResults: "1" },
    apiKey,
  );
  const playlist = meta.items?.[0];
  if (!playlist) throw new ImportError("This playlist is private or unavailable.");
  // Paginate through every playlist item (handles playlists with hundreds of videos)
  const rawItems = [];
  let pageToken;
  let pages = 0;
  do {
    const page = await ytFetch(
      "playlistItems",
      {
        part: "snippet,contentDetails,status",
        playlistId,
        maxResults: "50",
        ...(pageToken ? { pageToken } : {}),
      },
      apiKey,
    );
    for (const item of page.items ?? []) {
      const title = item.snippet.title;
      if (title === "Private video" || title === "Deleted video") continue;
      rawItems.push({
        videoId: item.contentDetails.videoId,
        position: item.snippet.position,
        title,
        description: item.snippet.description ?? "",
      });
    }
    pageToken = page.nextPageToken;
    pages += 1;
  } while (pageToken && pages < 60);
  if (rawItems.length === 0) throw new ImportError("This playlist has no playable videos.");
  // Fetch durations in batches of 50
  const details = new Map();
  for (let i = 0; i < rawItems.length; i += 50) {
    const batch = rawItems.slice(i, i + 50);
    const res = await ytFetch(
      "videos",
      {
        part: "contentDetails,status",
        id: batch.map((b) => b.videoId).join(","),
        maxResults: "50",
      },
      apiKey,
    );
    for (const item of res.items ?? []) {
      details.set(item.id, {
        durationSeconds: parseIsoDuration(item.contentDetails?.duration),
        unavailable: item.status?.embeddable === false,
      });
    }
  }
  const videos = rawItems
    .sort((a, b) => a.position - b.position)
    .map((item, index) => {
      const detail = details.get(item.videoId);
      return {
        videoId: item.videoId,
        title: item.title,
        description: item.description.slice(0, 2000),
        thumbnail: `https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg`,
        durationSeconds: detail?.durationSeconds ?? 0,
        position: index,
        unavailable: detail?.unavailable ?? !detail,
      };
    });
  return {
    playlistId,
    title: playlist.snippet.title,
    description: (playlist.snippet.description ?? "").slice(0, 4000),
    channelTitle: playlist.snippet.channelTitle,
    thumbnail:
      playlist.snippet.thumbnails?.["high"]?.url ??
      playlist.snippet.thumbnails?.["medium"]?.url ??
      videos[0]?.thumbnail ??
      "",
    videos,
    totalSeconds: videos.reduce((sum, v) => sum + v.durationSeconds, 0),
  };
}
export const previewPlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ url: z.string().min(3) }).parse(input))
  .handler(async ({ data, context }) => {
    const playlistId = extractPlaylistId(data.url);
    if (!playlistId) {
      return { ok: false, error: "That doesn't look like a YouTube playlist URL." };
    }
    try {
      const preview = await loadPlaylist(playlistId);
      const { data: existing } = await context.supabase
        .from("courses")
        .select("id")
        .eq("playlist_id", playlistId)
        .limit(1)
        .maybeSingle();
      return { ok: true, preview: { ...preview, existingCourseId: existing?.id ?? null } };
    } catch (error) {
      if (error instanceof ImportError) return { ok: false, error: error.message };
      console.error("previewPlaylist failed", error);
      return { ok: false, error: "Something went wrong while reading that playlist." };
    }
  });
const importSchema = z.object({
  playlistId: z.string().min(5),
  videoIds: z.array(z.string().min(3)).min(1).max(1000),
  targetDays: z.number().int().min(1).max(MAX_TARGET_DAYS).nullable().optional(),
  dailyCapMinutes: z
    .number()
    .int()
    .min(MIN_DAILY_CAP_MINUTES)
    .max(MAX_DAILY_CAP_MINUTES)
    .nullable()
    .optional(),
});
export const importCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => importSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    try {
      const playlist = await loadPlaylist(data.playlistId);
      const wanted = new Set(data.videoIds);
      const selected = playlist.videos.filter((v) => wanted.has(v.videoId));
      if (selected.length === 0) return { ok: false, error: "No videos were selected." };
      const targetDays = data.targetDays ?? null;
      const dailyCapMinutes = data.dailyCapMinutes ?? null;
      const { data: course, error: courseError } = await supabase
        .from("courses")
        .insert({
          user_id: userId,
          playlist_id: playlist.playlistId,
          title: playlist.title,
          description: playlist.description,
          channel_title: playlist.channelTitle,
          thumbnail_url: playlist.thumbnail,
          video_count: selected.length,
          total_seconds: selected.reduce((s, v) => s + v.durationSeconds, 0),
          target_days: targetDays,
          daily_cap_minutes: dailyCapMinutes,
        })
        .select("id")
        .single();
      if (courseError || !course) {
        console.error("course insert failed", courseError);
        return { ok: false, error: "Could not save the course." };
      }
      // A daily watch-time cap wins over "spread across N days": videos keep
      // playlist order and are never split across days.
      const schedulable = selected.map((video) => ({
        id: video.videoId,
        duration_seconds: video.durationSeconds,
      }));
      const schedule = dailyCapMinutes
        ? packByDailyCap(schedulable, dailyCapMinutes * 60)
        : targetDays
          ? assignScheduledDays(schedulable, targetDays)
          : null;
      const rows = selected.map((video, index) => ({
        course_id: course.id,
        user_id: userId,
        video_id: video.videoId,
        title: video.title,
        description: video.description,
        thumbnail_url: video.thumbnail,
        duration_seconds: video.durationSeconds,
        position: index,
        unavailable: video.unavailable,
        scheduled_day: schedule?.get(video.videoId) ?? null,
      }));
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await supabase.from("lessons").insert(rows.slice(i, i + 200));
        if (error) {
          console.error("lesson insert failed", error);
          await supabase.from("courses").delete().eq("id", course.id);
          return { ok: false, error: "Could not save the lessons for this course." };
        }
      }
      await supabase.from("activities").insert({
        user_id: userId,
        kind: "course_imported",
        course_id: course.id,
        meta: { lessons: rows.length },
      });
      return { ok: true, courseId: course.id };
    } catch (error) {
      if (error instanceof ImportError) return { ok: false, error: error.message };
      console.error("importCourse failed", error);
      return { ok: false, error: "Something went wrong while importing this playlist." };
    }
  });
