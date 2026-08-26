import { z } from "zod";
const fileSchema = z.object({
  path: z.string().min(1).max(200),
  content: z.string().max(1_000_000),
});
export const runSchema = z.object({
  language: z.string().min(1).max(30),
  entry: z.string().min(1).max(200),
  files: z.array(fileSchema).min(1).max(100),
  stdin: z.string().max(100_000).optional(),
  lessonId: z.string().uuid().optional(),
});
export const versionSchema = z.object({ language: z.string().min(1).max(30) });
/** Per-user sliding-window rate limit (per worker instance). */
const buckets = new Map();
const WINDOW_MS = 60_000;
const MAX_RUNS_PER_WINDOW = 30;
export function rateLimited(userId) {
  const now = Date.now();
  const hits = (buckets.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= MAX_RUNS_PER_WINDOW) {
    buckets.set(userId, hits);
    return true;
  }
  hits.push(now);
  buckets.set(userId, hits);
  return false;
}
