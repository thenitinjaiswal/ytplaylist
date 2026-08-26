/** Workspace layout model: presets, focus modes and persistence helpers. */
export const LAYOUT_PRESETS = [
  {
    id: "default",
    label: "Default",
    main: { sidebar: 16, left: 34, code: 50 },
    left: { video: 55, notes: 45 },
  },
  {
    id: "coding",
    label: "Coding",
    main: { sidebar: 12, left: 24, code: 64 },
    left: { video: 55, notes: 45 },
  },
  {
    id: "watching",
    label: "Watching",
    main: { sidebar: 14, left: 56, code: 30 },
    left: { video: 72, notes: 28 },
  },
  {
    id: "notes",
    label: "Notes",
    main: { sidebar: 12, left: 46, code: 42 },
    left: { video: 34, notes: 66 },
  },
  {
    id: "ide",
    label: "Full IDE",
    main: { sidebar: 10, left: 18, code: 72 },
    left: { video: 58, notes: 42 },
  },
];
export function getPreset(id) {
  return LAYOUT_PRESETS.find((preset) => preset.id === id) ?? LAYOUT_PRESETS[0];
}
export const PANEL_LABELS = {
  sidebar: "Lessons",
  video: "Video",
  code: "Code",
  notes: "Notes",
};
export function loadLayout(key) {
  try {
    const raw =
      typeof window === "undefined" ? null : localStorage.getItem(`codestudy:layout:${key}`);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return undefined;
    const out = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value === "number" && Number.isFinite(value)) out[id] = value;
    }
    return Object.keys(out).length ? out : undefined;
  } catch {
    return undefined;
  }
}
export function saveLayout(key, layout) {
  try {
    localStorage.setItem(`codestudy:layout:${key}`, JSON.stringify(layout));
  } catch {
    /* storage unavailable */
  }
}
export const DEFAULT_VIEW = {
  preset: "default",
  hidden: [],
  sidebarCollapsed: false,
  floatingVideo: false,
};
const VIEW_KEY = "codestudy:workspace:view";
export function loadView() {
  try {
    const raw = typeof window === "undefined" ? null : localStorage.getItem(VIEW_KEY);
    if (!raw) return DEFAULT_VIEW;
    const parsed = JSON.parse(raw);
    return {
      preset: typeof parsed.preset === "string" ? parsed.preset : DEFAULT_VIEW.preset,
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden.filter((k) => k in PANEL_LABELS) : [],
      sidebarCollapsed: Boolean(parsed.sidebarCollapsed),
      floatingVideo: Boolean(parsed.floatingVideo),
    };
  } catch {
    return DEFAULT_VIEW;
  }
}
export function saveView(view) {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(view));
  } catch {
    /* storage unavailable */
  }
}
export const DEFAULT_FLOATING = {
  x: 24,
  y: 24,
  width: 320,
  minimized: false,
};
const FLOATING_KEY = "codestudy:workspace:pip";
export function loadFloating() {
  try {
    const raw = localStorage.getItem(FLOATING_KEY);
    if (!raw) return DEFAULT_FLOATING;
    const parsed = JSON.parse(raw);
    return {
      x: typeof parsed.x === "number" ? parsed.x : DEFAULT_FLOATING.x,
      y: typeof parsed.y === "number" ? parsed.y : DEFAULT_FLOATING.y,
      width: typeof parsed.width === "number" ? parsed.width : DEFAULT_FLOATING.width,
      minimized: Boolean(parsed.minimized),
    };
  } catch {
    return DEFAULT_FLOATING;
  }
}
export function saveFloating(state) {
  try {
    localStorage.setItem(FLOATING_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable */
  }
}
/** Layout storage that is safe to reference during SSR / prerender. */
export function layoutStorage() {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
