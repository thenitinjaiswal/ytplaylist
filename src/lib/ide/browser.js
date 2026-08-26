/**
 * In-workspace browser model.
 *
 * Many sites (Google, Stack Overflow, MDN…) refuse to be framed, so the panel
 * distinguishes between engines that can render inline and ones that must open
 * in a real browser tab.
 */
export const SEARCH_ENGINES = [
  {
    id: "web",
    label: "Web search",
    embeddable: true,
    url: (q) => `https://searx.be/search?q=${encodeURIComponent(q)}`,
  },
  {
    id: "web-alt",
    label: "Web (mirror)",
    embeddable: true,
    url: (q) => `https://search.disroot.org/search?q=${encodeURIComponent(q)}`,
  },
  {
    id: "devdocs",
    label: "DevDocs",
    embeddable: true,
    url: (q) => `https://devdocs.io/#q=${encodeURIComponent(q)}`,
  },
  {
    id: "wikipedia",
    label: "Wikipedia",
    embeddable: true,
    url: (q) => `https://en.m.wikipedia.org/w/index.php?search=${encodeURIComponent(q)}`,
  },
  {
    id: "google",
    label: "Google",
    embeddable: false,
    url: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
  },
  {
    id: "duckduckgo",
    label: "DuckDuckGo",
    embeddable: false,
    url: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
  },
  {
    id: "leetcode",
    label: "LeetCode",
    embeddable: false,
    url: (q) => `https://leetcode.com/problemset/?search=${encodeURIComponent(q)}`,
  },
  {
    id: "geeksforgeeks",
    label: "GeeksforGeeks",
    embeddable: false,
    url: (q) => `https://www.geeksforgeeks.org/search/?q=${encodeURIComponent(q)}`,
  },
  {
    id: "stackoverflow",
    label: "Stack Overflow",
    embeddable: false,
    url: (q) => `https://stackoverflow.com/search?q=${encodeURIComponent(q)}`,
  },
  {
    id: "youtube",
    label: "YouTube",
    embeddable: false,
    url: (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
  },
];
export function getEngine(id) {
  return SEARCH_ENGINES.find((engine) => engine.id === id) ?? SEARCH_ENGINES[0];
}
/** Curated shortcuts for quick access. */
export const QUICK_LINKS = [
  { label: "LeetCode", url: "https://leetcode.com/problemset/" },
  { label: "GeeksforGeeks", url: "https://www.geeksforgeeks.org" },
  { label: "DevDocs", url: "https://devdocs.io" },
  { label: "Python docs", url: "https://docs.python.org/3/" },
  { label: "C++ reference", url: "https://en.cppreference.com/w/" },
  { label: "Java docs", url: "https://docs.oracle.com/en/java/javase/17/docs/api/" },
  { label: "Regex tester", url: "https://regex101.com" },
  { label: "JSON formatter", url: "https://jsonformatter.org" },
];
const LOOKS_LIKE_URL = /^[\w-]+(\.[\w-]+)+(\/|$|[:?#])/i;
/**
 * Turns whatever the user typed into either a URL to load or a search query.
 */
export function resolveInput(raw, engine) {
  const value = raw.trim();
  if (!value) return { kind: "search", url: "" };
  if (/^https?:\/\//i.test(value)) return { kind: "url", url: value };
  if (/^[a-z]+:\/\//i.test(value)) return { kind: "url", url: value };
  if (LOOKS_LIKE_URL.test(value) && !value.includes(" ")) {
    return { kind: "url", url: `https://${value}` };
  }
  return { kind: "search", url: engine.url(value) };
}
/**
 * Hosts that always send X-Frame-Options / frame-ancestors deny, so an iframe
 * can never render them. These are opened in a real browser tab instead.
 */
const BLOCKED_HOSTS = [
  "google.",
  "youtube.com",
  "youtu.be",
  "stackoverflow.com",
  "stackexchange.com",
  "developer.mozilla.org",
  "github.com",
  "reddit.com",
  "x.com",
  "twitter.com",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "amazon.",
  "chatgpt.com",
  "openai.com",
  "medium.com",
  "leetcode.com",
  "notion.so",
  "bing.com",
  "duckduckgo.com",
];
export function isFrameBlocked(url) {
  const host = hostOf(url).toLowerCase();
  if (!host) return false;
  return BLOCKED_HOSTS.some((entry) =>
    entry.endsWith(".")
      ? host.startsWith(entry) || host.includes(`.${entry}`)
      : host === entry || host.endsWith(`.${entry}`),
  );
}
export function hostOf(url) {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}
// v2 resets older DevDocs-first preferences to the new Google-first experience.
const KEY = "codestudy:browser:v2";
export const HOME_URL = "https://www.google.com/";
export const DEFAULT_ENGINE_ID = "google";
export const INLINE_FALLBACK_ENGINE_ID = "web";
/** Google blocks iframes, so its homepage is rendered natively in the panel. */
export function isGoogleHomeUrl(raw) {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return host === "google.com" && (url.pathname === "/" || url.pathname === "");
  } catch {
    return false;
  }
}
export function loadBrowserPrefs() {
  const fallback = { engineId: DEFAULT_ENGINE_ID, homeUrl: HOME_URL, history: [] };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return {
      engineId: typeof parsed.engineId === "string" ? parsed.engineId : fallback.engineId,
      homeUrl: typeof parsed.homeUrl === "string" ? parsed.homeUrl : fallback.homeUrl,
      history: Array.isArray(parsed.history) ? parsed.history.slice(0, 20) : [],
    };
  } catch {
    return fallback;
  }
}
export function saveBrowserPrefs(prefs) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ ...prefs, history: prefs.history.slice(0, 20) }),
    );
  } catch {
    /* storage unavailable — the browser simply forgets recents */
  }
}
/** Inline-capable web search, used when the picked engine refuses embedding. */
export function webSearchUrl(query) {
  return getEngine(INLINE_FALLBACK_ENGINE_ID).url(query);
}
/* ------------------------------------------------------------- tab restoring */
const TABS_KEY = "codestudy:browser:tabs:v1";
export function saveBrowserTabs(tabs, activeIndex) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TABS_KEY, JSON.stringify({ activeIndex, tabs: tabs.slice(0, 12) }));
  } catch {
    /* storage unavailable — tabs simply reset next reload */
  }
}
export function loadBrowserTabs() {
  const fallback = { tabs: [], activeIndex: 0 };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(TABS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    const tabs = Array.isArray(parsed.tabs)
      ? parsed.tabs
          .filter((tab) => tab && Array.isArray(tab.urls) && tab.urls.length > 0)
          .map((tab) => ({
            title: typeof tab.title === "string" ? tab.title : "New tab",
            urls: tab.urls.filter((url) => typeof url === "string").slice(0, 20),
            index: Math.min(Math.max(Number(tab.index) || 0, 0), tab.urls.length - 1),
          }))
      : [];
    return {
      tabs: tabs.slice(0, 12),
      activeIndex: Math.min(
        Math.max(Number(parsed.activeIndex) || 0, 0),
        Math.max(tabs.length - 1, 0),
      ),
    };
  } catch {
    return fallback;
  }
}
