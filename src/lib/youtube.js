/** Client-safe YouTube helpers (no API key involved). */
export function extractPlaylistId(input) {
  const value = input.trim();
  if (!value) return null;
  // Bare playlist id
  if (/^(PL|UU|FL|OL|RD|LL)[A-Za-z0-9_-]{10,}$/.test(value)) return value;
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    if (!/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(url.hostname)) return null;
    const list = url.searchParams.get("list");
    if (list && /^[A-Za-z0-9_-]{12,}$/.test(list)) return list;
    return null;
  } catch {
    return null;
  }
}
export function youtubeThumbnail(videoId) {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}
export function videoUrl(videoId, seconds) {
  const base = `https://www.youtube.com/watch?v=${videoId}`;
  return seconds ? `${base}&t=${Math.floor(seconds)}s` : base;
}
