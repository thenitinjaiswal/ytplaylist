/**
 * Free-form workspace canvas model.
 *
 * The lesson screen is a canvas: the YouTube player is the background learning
 * layer and every other surface (code IDE, notes, lesson list) is a floating
 * window with its own position, size, stacking order and window state.
 */
export const WINDOW_LABELS = {
  code: "CodeStudy IDE",
  notes: "Notes",
  lessons: "Lessons",
  video: "Video",
  browser: "Browser",
};
export const MIN_SIZE = {
  code: { width: 420, height: 260 },
  notes: { width: 260, height: 200 },
  lessons: { width: 220, height: 200 },
  video: { width: 240, height: 170 },
  browser: { width: 320, height: 240 },
};
export const MODE_LABELS = {
  normal: "Normal",
  code: "Code focus",
  video: "Video focus",
  notes: "Notes focus",
  free: "Free canvas",
};
export const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));
const GAP = 16;
/** Never let a window be dragged fully off-canvas. */
export const KEEP_VISIBLE = 96;
function base(state) {
  return {
    x: 0,
    y: 0,
    width: 600,
    height: 400,
    z: 10,
    minimized: false,
    maximized: false,
    visible: true,
    ...state,
  };
}
/** Default arrangement: video as background, IDE centred, notes on the right. */
export function defaultCanvas(bounds) {
  const w = Math.max(bounds.width, 640);
  const h = Math.max(bounds.height, 480);
  const notesWidth = clamp(Math.round(w * 0.24), 280, 380);
  const codeWidth = clamp(Math.round(w * 0.62), 460, w - notesWidth - GAP * 3);
  const codeHeight = clamp(Math.round(h * 0.78), 280, h - GAP * 2);
  return {
    mode: "normal",
    videoBackground: true,
    windows: {
      video: base({
        x: GAP,
        y: GAP,
        width: clamp(Math.round(w * 0.3), 260, 520),
        height: clamp(Math.round(w * 0.3 * 0.62), 190, 340),
        z: 5,
        visible: true,
      }),
      code: base({
        x: GAP,
        y: Math.round((h - codeHeight) / 2),
        width: codeWidth,
        height: codeHeight,
        z: 30,
      }),
      notes: base({
        x: Math.max(GAP, w - notesWidth - GAP),
        y: GAP,
        width: notesWidth,
        height: clamp(Math.round(h * 0.56), 220, h - GAP * 2),
        z: 20,
      }),
      lessons: base({
        x: Math.max(GAP, w - notesWidth - GAP),
        y: Math.min(h - 240, GAP + clamp(Math.round(h * 0.56), 220, h - GAP * 2) + GAP),
        width: notesWidth,
        height: 220,
        z: 15,
        visible: false,
      }),
      browser: base({
        x: clamp(Math.round(w * 0.18), GAP, Math.max(GAP, w - 520)),
        y: clamp(Math.round(h * 0.14), GAP, Math.max(GAP, h - 380)),
        width: clamp(Math.round(w * 0.5), 360, Math.max(360, w - GAP * 2)),
        height: clamp(Math.round(h * 0.6), 260, Math.max(260, h - GAP * 2)),
        z: 25,
        visible: false,
      }),
    },
  };
}
/** Applies a workspace mode on top of the current window set. */
export function applyMode(state, mode, bounds) {
  const fresh = defaultCanvas(bounds);
  const w = Math.max(bounds.width, 640);
  const h = Math.max(bounds.height, 480);
  const windows = { ...state.windows };
  const set = (key, patch) => {
    windows[key] = { ...windows[key], ...patch };
  };
  if (mode === "free") return { ...state, mode };
  if (mode === "normal") {
    return { ...fresh, mode };
  }
  if (mode === "code") {
    set("code", {
      ...fresh.windows.code,
      x: GAP,
      y: GAP,
      width: w - GAP * 2,
      height: h - GAP * 2,
      minimized: false,
      maximized: false,
      visible: true,
      z: 30,
    });
    set("video", {
      ...windows.video,
      x: Math.max(GAP, w - 340 - GAP),
      y: Math.max(GAP, h - 220 - GAP),
      width: 340,
      height: 212,
      minimized: false,
      visible: true,
      z: 40,
    });
    set("notes", { ...windows.notes, visible: false });
    return { ...state, mode, videoBackground: false, windows };
  }
  if (mode === "video") {
    set("code", {
      ...windows.code,
      x: Math.max(GAP, w - 480 - GAP),
      y: Math.max(GAP, h - 320 - GAP),
      width: 480,
      height: 320,
      minimized: false,
      maximized: false,
      visible: true,
      z: 30,
    });
    set("notes", { ...windows.notes, visible: false });
    return { ...state, mode, videoBackground: true, windows };
  }
  // notes focus
  set("notes", {
    ...windows.notes,
    x: GAP,
    y: GAP,
    width: Math.round(w * 0.6),
    height: h - GAP * 2,
    minimized: false,
    maximized: false,
    visible: true,
    z: 30,
  });
  set("code", { ...windows.code, visible: false });
  set("video", {
    ...windows.video,
    x: Math.max(GAP, w - 340 - GAP),
    y: Math.max(GAP, h - 220 - GAP),
    width: 340,
    height: 212,
    minimized: false,
    visible: true,
    z: 40,
  });
  return { ...state, mode, videoBackground: false, windows };
}
/** Keeps a window inside the canvas while allowing partial overhang. */
export function clampWindow(state, key, bounds) {
  if (!bounds.width || !bounds.height) return state;
  const min = MIN_SIZE[key];
  const width = clamp(state.width, min.width, Math.max(min.width, bounds.width - 8));
  const height = clamp(state.height, min.height, Math.max(min.height, bounds.height - 8));
  return {
    ...state,
    width,
    height,
    x: clamp(state.x, KEEP_VISIBLE - width, Math.max(0, bounds.width - KEEP_VISIBLE)),
    y: clamp(state.y, 0, Math.max(0, bounds.height - 40)),
  };
}
const EDGE = 28;
export function snapZoneFor(pointer, bounds) {
  if (!bounds.width || !bounds.height) return null;
  const nearTop = pointer.y <= EDGE;
  const nearLeft = pointer.x <= EDGE;
  const nearRight = pointer.x >= bounds.width - EDGE;
  const nearBottom = pointer.y >= bounds.height - EDGE;
  if (nearTop && !nearLeft && !nearRight) return "full";
  if (nearLeft) return "left";
  if (nearRight) return "right";
  if (nearBottom) return "bottom";
  return null;
}
export function rectForZone(zone, bounds) {
  const w = bounds.width;
  const h = bounds.height;
  switch (zone) {
    case "left":
      return { x: 0, y: 0, width: Math.round(w / 2), height: h };
    case "right":
      return { x: Math.round(w / 2), y: 0, width: Math.round(w / 2), height: h };
    case "top":
      return { x: 0, y: 0, width: w, height: Math.round(h / 2) };
    case "bottom":
      return { x: 0, y: Math.round(h / 2), width: w, height: Math.round(h / 2) };
    default:
      return { x: 0, y: 0, width: w, height: h };
  }
}
/* --------------------------------------------------------------- persistence */
const KEY = (lessonId) => `codestudy:canvas:v3:${lessonId}`;
export function loadCanvas(lessonId) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY(lessonId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.windows?.code || !parsed?.windows?.browser) return null;
    return parsed;
  } catch {
    return null;
  }
}
export function saveCanvas(lessonId, state) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY(lessonId), JSON.stringify(state));
  } catch {
    /* storage full or blocked — layout simply isn't remembered */
  }
}
export function clearCanvas(lessonId) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY(lessonId));
  } catch {
    /* ignore */
  }
}
export function topZ(state) {
  return Math.max(...Object.values(state.windows).map((entry) => entry.z));
}
