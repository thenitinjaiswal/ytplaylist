import { getLanguage } from "@/lib/languages";
import { bytesToBase64, createZip } from "@/lib/ide/zip";
export const SAFE_PATH = /^(?!.*\/\/)(?![./])[A-Za-z0-9._\-/]+$/;
export function validateWorkspacePath(path, existing) {
  const clean = path.trim();
  if (!clean) return "Name cannot be empty";
  if (clean.length > 200) return "Name is too long";
  if (clean.includes("..") || clean.startsWith("/")) return "That path is not allowed";
  if (!SAFE_PATH.test(clean)) return "Use letters, digits, dot, dash, underscore and /";
  if (existing.includes(clean)) return "A file with that path already exists";
  return null;
}
export function starterWorkspace(languageId) {
  return getLanguage(languageId).starterFiles.map((f) => ({ ...f }));
}
export function sortFiles(files) {
  return [...files].sort((a, b) => a.path.localeCompare(b.path));
}
export function buildTree(paths) {
  const root = { name: "", path: "", type: "folder", children: [] };
  for (const path of [...paths].sort()) {
    const parts = path.split("/");
    let node = root;
    parts.forEach((part, index) => {
      const isFile = index === parts.length - 1;
      const full = parts.slice(0, index + 1).join("/");
      let next = node.children.find((c) => c.name === part && c.path === full);
      if (!next) {
        next = { name: part, path: full, type: isFile ? "file" : "folder", children: [] };
        node.children.push(next);
      }
      node = next;
    });
  }
  const order = (nodes) =>
    nodes
      .map((n) => ({ ...n, children: order(n.children) }))
      .sort((a, b) =>
        a.type === b.type ? a.name.localeCompare(b.name) : a.type === "folder" ? -1 : 1,
      );
  return order(root.children);
}
/** Local (offline) draft cache, keyed per lesson + language. */
export function draftKey(lessonId, language) {
  return `codestudy:ws:${lessonId}:${language}`;
}
export function saveDraft(lessonId, language, files) {
  try {
    localStorage.setItem(draftKey(lessonId, language), JSON.stringify({ files, at: Date.now() }));
  } catch {
    /* storage full or unavailable */
  }
}
export function loadDraft(lessonId, language) {
  try {
    const raw = localStorage.getItem(draftKey(lessonId, language));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.files) ? parsed.files : null;
  } catch {
    return null;
  }
}
export function clearDraft(lessonId, language) {
  try {
    localStorage.removeItem(draftKey(lessonId, language));
  } catch {
    /* ignore */
  }
}
export function downloadWorkspaceZip(files, name) {
  const safeName = name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "project";
  const zip = createZip(files.map((f) => ({ path: `${safeName}/${f.path}`, content: f.content })));
  const link = document.createElement("a");
  link.href = `data:application/zip;base64,${bytesToBase64(zip)}`;
  link.download = `${safeName}.zip`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
export function parseErrorLocations(text, paths) {
  const out = [];
  const seen = new Set();
  const patterns = [
    /([\w./-]+\.(?:java|cpp|cc|h|hpp|py|js|ts)):(\d+)(?::(\d+))?/g,
    /File "([\w./-]+)", line (\d+)/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const raw = match[1];
      const line = Number(match[2]);
      const file =
        paths.find((p) => p === raw) ?? paths.find((p) => p.endsWith(`/${raw.split("/").pop()}`));
      if (!file || !Number.isFinite(line)) continue;
      const key = `${file}:${line}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ file, line, ...(match[3] ? { column: Number(match[3]) } : {}) });
    }
  }
  return out;
}
