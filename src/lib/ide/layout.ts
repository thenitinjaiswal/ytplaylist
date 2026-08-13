/** Workspace layout model: presets, focus modes and persistence helpers. */

export type PanelKey = "sidebar" | "video" | "code" | "notes";

export interface LayoutPreset {
  id: string;
  label: string;
  /** Main horizontal split (percentages of the workspace). */
  main: { sidebar: number; left: number; code: number };
  /** Vertical split of the left column. */
  left: { video: number; notes: number };
}

export const LAYOUT_PRESETS: LayoutPreset[] = [
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

export function getPreset(id: string): LayoutPreset {
  return LAYOUT_PRESETS.find((preset) => preset.id === id) ?? LAYOUT_PRESETS[0]!;
}

export const PANEL_LABELS: Record<PanelKey, string> = {
  sidebar: "Lessons",
  video: "Video",
  code: "Code",
  notes: "Notes",
};

/* ------------------------------------------------------ layout persistence */

export type StoredLayout = Record<string, number>;

export function loadLayout(key: string): StoredLayout | undefined {
  try {
    const raw =
      typeof window === "undefined" ? null : localStorage.getItem(`codestudy:layout:${key}`);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return undefined;
    const out: StoredLayout = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isFinite(value)) out[id] = value;
    }
    return Object.keys(out).length ? out : undefined;
  } catch {
    return undefined;
  }
}

export function saveLayout(key: string, layout: StoredLayout) {
  try {
    localStorage.setItem(`codestudy:layout:${key}`, JSON.stringify(layout));
  } catch {
    /* storage unavailable */
  }
}

/** Which panels are visible plus the active preset. */
export interface WorkspaceView {
  preset: string;
  hidden: PanelKey[];
  sidebarCollapsed: boolean;
  floatingVideo: boolean;
}

export const DEFAULT_VIEW: WorkspaceView = {
  preset: "default",
  hidden: [],
  sidebarCollapsed: false,
  floatingVideo: false,
};

const VIEW_KEY = "codestudy:workspace:view";

export function loadView(): WorkspaceView {
  try {
    const raw = typeof window === "undefined" ? null : localStorage.getItem(VIEW_KEY);
    if (!raw) return DEFAULT_VIEW;
    const parsed = JSON.parse(raw) as Partial<WorkspaceView>;
    return {
      preset: typeof parsed.preset === "string" ? parsed.preset : DEFAULT_VIEW.preset,
      hidden: Array.isArray(parsed.hidden)
        ? (parsed.hidden.filter((k) => k in PANEL_LABELS) as PanelKey[])
        : [],
      sidebarCollapsed: Boolean(parsed.sidebarCollapsed),
      floatingVideo: Boolean(parsed.floatingVideo),
    };
  } catch {
    return DEFAULT_VIEW;
  }
}

export function saveView(view: WorkspaceView) {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(view));
  } catch {
    /* storage unavailable */
  }
}

/* --------------------------------------------------------- floating video */

export interface FloatingVideoState {
  x: number;
  y: number;
  width: number;
  minimized: boolean;
}

export const DEFAULT_FLOATING: FloatingVideoState = {
  x: 24,
  y: 24,
  width: 320,
  minimized: false,
};

const FLOATING_KEY = "codestudy:workspace:pip";

export function loadFloating(): FloatingVideoState {
  try {
    const raw = localStorage.getItem(FLOATING_KEY);
    if (!raw) return DEFAULT_FLOATING;
    const parsed = JSON.parse(raw) as Partial<FloatingVideoState>;
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

export function saveFloating(state: FloatingVideoState) {
  try {
    localStorage.setItem(FLOATING_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable */
  }
}

/** Layout storage that is safe to reference during SSR / prerender. */
export function layoutStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
