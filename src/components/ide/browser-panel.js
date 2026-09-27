import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Globe,
  Home,
  LoaderCircle,
  Plus,
  RotateCw,
  Search,
  X,
} from "lucide-react";
import { readBrowserPage, searchBrowser } from "@/lib/browser.functions";
import {
  getEngine,
  hostOf,
  HOME_URL,
  isGoogleHomeUrl,
  loadBrowserPrefs,
  loadBrowserTabs,
  QUICK_LINKS,
  resolveInput,
  saveBrowserPrefs,
  saveBrowserTabs,
  SEARCH_ENGINES,
} from "@/lib/ide/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
const initialView = (url) => ({
  kind: "home",
  url,
  mode: isGoogleHomeUrl(url) ? "google" : "frame",
});
const viewTitle = (view) => {
  if (view.kind === "results") return view.query;
  if (view.kind === "reader") return view.document.title || hostOf(view.url);
  if (view.kind === "pending") return hostOf(view.url) || "New tab";
  return isGoogleHomeUrl(view.url) ? "New tab" : hostOf(view.url) || "New tab";
};
const makeTab = (view) => ({
  id: `tab-${Math.random().toString(36).slice(2, 9)}`,
  title: viewTitle(view),
  history: [view],
  index: 0,
  loading: false,
  error: null,
});
/** Rebuilds tabs saved before a reload; entries load lazily when first shown. */
const restoreTabs = () => {
  const stored = loadBrowserTabs();
  if (!stored.tabs.length) return { tabs: [], activeIndex: 0 };
  const tabs = stored.tabs.map((entry) => {
    const views = entry.urls.map((url) =>
      isGoogleHomeUrl(url) ? initialView(HOME_URL) : { kind: "pending", url },
    );
    return {
      id: `tab-${Math.random().toString(36).slice(2, 9)}`,
      title: entry.title || "New tab",
      history: views.length ? views : [initialView(HOME_URL)],
      index: Math.min(entry.index, Math.max(views.length - 1, 0)),
      loading: false,
      error: null,
    };
  });
  return { tabs, activeIndex: stored.activeIndex };
};
/** A workspace-native browser with its own tabs: links never leave the lesson. */
export function BrowserPanel() {
  const prefs = useMemo(() => loadBrowserPrefs(), []);
  const searchWeb = useServerFn(searchBrowser);
  const readPage = useServerFn(readBrowserPage);
  const restored = useMemo(() => restoreTabs(), []);
  const [engineId, setEngineId] = useState(prefs.engineId);
  const [tabs, setTabs] = useState(() =>
    restored.tabs.length ? restored.tabs : [makeTab(initialView(prefs.homeUrl || HOME_URL))],
  );
  const [activeId, setActiveId] = useState(
    () => restored.tabs[restored.activeIndex]?.id ?? restored.tabs[0]?.id ?? "",
  );
  const [field, setField] = useState(prefs.homeUrl || HOME_URL);
  const [reloadKey, setReloadKey] = useState(0);
  /** Kept before window.open is intercepted, so our own ↗ buttons still work. */
  const nativeOpen = useRef(null);
  const fallbackTab = useMemo(() => makeTab(initialView(HOME_URL)), []);
  const activeTab = tabs.find((tab) => tab.id === activeId) ?? tabs[0] ?? fallbackTab;
  const current = activeTab.history[activeTab.index] ?? initialView(HOME_URL);
  const engine = getEngine(engineId);
  useEffect(() => {
    const first = tabs[0];
    if (first && !tabs.some((tab) => tab.id === activeId)) setActiveId(first.id);
  }, [tabs, activeId]);
  useEffect(
    () => setField(current.url.startsWith("search:") ? current.url.slice(7) : current.url),
    [current],
  );
  useEffect(() => {
    const recents = tabs
      .flatMap((tab) => tab.history.map((entry) => entry.url))
      .filter(Boolean)
      .reverse();
    saveBrowserPrefs({ engineId, homeUrl: HOME_URL, history: [...new Set(recents)].slice(0, 20) });
  }, [engineId, tabs]);
  // Persist the tab strip (URL trail per tab) so a reload restores the session.
  useEffect(() => {
    saveBrowserTabs(
      tabs.map((tab) => ({
        title: tab.title,
        urls: tab.history.map((entry) => entry.url),
        index: tab.index,
      })),
      Math.max(
        tabs.findIndex((tab) => tab.id === activeTab.id),
        0,
      ),
    );
  }, [tabs, activeTab.id]);
  const patchTab = (id, patch) =>
    setTabs((previous) => previous.map((tab) => (tab.id === id ? patch(tab) : tab)));
  const pushView = (id, view, replace = false) =>
    patchTab(id, (tab) => ({
      ...tab,
      history: replace
        ? tab.history.map((entry, position) => (position === tab.index ? view : entry))
        : [...tab.history.slice(0, tab.index + 1), view],
      index: replace ? tab.index : tab.index + 1,
      title: viewTitle(view),
      error: null,
    }));
  const setBusy = (id, loading, error = null) =>
    patchTab(id, (tab) => ({ ...tab, loading, error: loading ? null : (error ?? tab.error) }));
  const runSearch = async (query, tabId = activeTab.id, replace = false) => {
    const cleanQuery = query.trim();
    if (!cleanQuery) return;
    setBusy(tabId, true);
    setField(cleanQuery);
    try {
      const results = await searchWeb({ data: { query: cleanQuery } });
      pushView(
        tabId,
        { kind: "results", url: `search:${cleanQuery}`, query: cleanQuery, results },
        replace,
      );
      setBusy(tabId, false, results.length ? null : "No results found. Try shorter keywords.");
    } catch (cause) {
      console.error("In-app search failed", cause);
      setBusy(tabId, false, "Search service is temporarily unavailable. Please retry.");
    }
  };
  /** Loads a page inside the panel. `inNewTab` opens it as a new in-app tab. */
  const openUrl = async (url, inNewTab = false, replace = false) => {
    if (isGoogleHomeUrl(url)) {
      if (inNewTab) openNewTab();
      else pushView(activeTab.id, initialView(HOME_URL), replace);
      return;
    }
    let tabId = activeTab.id;
    if (inNewTab) {
      const tab = makeTab({ kind: "frame", url });
      tab.title = hostOf(url);
      tab.loading = false;
      tabId = tab.id;
      setTabs((previous) => [...previous, tab]);
      setActiveId(tab.id);
    } else {
      setBusy(tabId, false);
      setField(url);
      pushView(tabId, { kind: "frame", url }, replace);
    }
  };
  const openNewTab = () => {
    const tab = makeTab(initialView(HOME_URL));
    setTabs((previous) => [...previous, tab]);
    setActiveId(tab.id);
  };
  const closeTab = (id) => {
    setTabs((previous) => {
      if (previous.length === 1) return [makeTab(initialView(HOME_URL))];
      const next = previous.filter((tab) => tab.id !== id);
      const last = next[next.length - 1];
      if (id === activeId && last) setActiveId(last.id);
      return next;
    });
  };
  // Latest handlers, so effects below never capture stale state.
  const apiRef = useRef({ openUrl, runSearch });
  apiRef.current = { openUrl, runSearch };
  /** Loads restored (pending) history entries the moment their tab is shown. */
  useEffect(() => {
    if (current.kind !== "pending" || activeTab.loading) return;
    const target = current.url;
    if (target.startsWith("search:"))
      void apiRef.current.runSearch(target.slice(7), activeTab.id, true);
    else void apiRef.current.openUrl(target, false, true);
  }, [current, activeTab.id, activeTab.loading]);
  /** Any window.open / target=_blank inside the panel becomes an in-app tab. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    nativeOpen.current = window.open.bind(window);
    const patched = (url, ...rest) => {
      const href = typeof url === "string" ? url : url?.toString();
      if (!href || !/^https?:/i.test(href)) {
        return nativeOpen.current?.(url, ...rest) ?? null;
      }
      void apiRef.current.openUrl(href, true);
      return null;
    };
    window.open = patched;
    return () => {
      if (nativeOpen.current) window.open = nativeOpen.current;
    };
  }, []);
  const openExternally = (url) => nativeOpen.current?.(url, "_blank", "noopener,noreferrer");
  /** Captures clicks on new-tab links rendered inside the panel. */
  const onPanelClick = useCallback((event) => {
    const anchor = event.target?.closest?.("a");
    if (!(anchor instanceof HTMLAnchorElement)) return;
    const href = anchor.href;
    if (!href || !/^https?:/i.test(href)) return;
    event.preventDefault();
    void apiRef.current.openUrl(href, anchor.target === "_blank" || event.metaKey || event.ctrlKey);
  }, []);
  const submit = (event) => {
    event.preventDefault();
    const raw = field.trim();
    if (!raw) return;
    const resolved = resolveInput(raw, engine);
    if (resolved.kind === "search") void runSearch(raw);
    else void openUrl(resolved.url);
  };
  const reload = () => {
    if (current.kind === "results") void runSearch(current.query, activeTab.id, true);
    else if (current.kind === "reader") void openUrl(current.url, false, true);
    else if (current.kind === "pending") void openUrl(current.url, false, true);
    else setReloadKey((value) => value + 1);
  };
  const go = (delta) =>
    patchTab(activeTab.id, (tab) => ({
      ...tab,
      index: Math.min(Math.max(tab.index + delta, 0), tab.history.length - 1),
    }));
  const externalUrl =
    current.kind === "results"
      ? engine.url(current.query)
      : current.url.startsWith("search:")
        ? HOME_URL
        : current.url;
  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-1.5 py-1">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            role="button"
            tabIndex={0}
            onClick={() => setActiveId(tab.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter") setActiveId(tab.id);
            }}
            className={`flex max-w-[180px] shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-mono-xs ${tab.id === activeTab.id ? "border-border bg-elevated text-foreground" : "border-transparent text-muted-foreground hover:bg-elevated/60"}`}
          >
            {tab.loading ? (
              <LoaderCircle className="size-3 shrink-0 animate-spin" />
            ) : (
              <Globe className="size-3 shrink-0" />
            )}
            <span className="truncate">{tab.title || "New tab"}</span>
            <button
              type="button"
              aria-label="Close tab"
              onClick={(event) => {
                event.stopPropagation();
                closeTab(tab.id);
              }}
              className="rounded p-0.5 hover:bg-background"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
        <Button
          size="icon"
          variant="ghost"
          className="size-6 shrink-0"
          onClick={openNewTab}
          aria-label="New tab"
        >
          <Plus className="size-3.5" />
        </Button>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border px-2 py-1.5">
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          disabled={activeTab.index === 0}
          onClick={() => go(-1)}
          aria-label="Back"
        >
          <ArrowLeft className="size-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          disabled={activeTab.index >= activeTab.history.length - 1}
          onClick={() => go(1)}
          aria-label="Forward"
        >
          <ArrowRight className="size-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="size-7" onClick={reload} aria-label="Reload">
          <RotateCw className="size-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          onClick={() => pushView(activeTab.id, initialView(HOME_URL))}
          aria-label="Home"
        >
          <Home className="size-3.5" />
        </Button>

        <form onSubmit={submit} className="flex min-w-[180px] flex-1 items-center gap-1.5">
          <div className="relative min-w-0 flex-1">
            <Globe className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={field}
              onChange={(event) => setField(event.target.value)}
              spellCheck={false}
              placeholder="Search the web or enter a URL"
              className="h-7 pl-7 text-xs"
              aria-label="Address and search bar"
            />
          </div>
          <Select value={engineId} onValueChange={setEngineId}>
            <SelectTrigger className="h-7 w-[124px] shrink-0 text-xs" aria-label="Search engine">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEARCH_ENGINES.map((item) => (
                <SelectItem key={item.id} value={item.id} className="text-xs">
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="submit"
            size="icon"
            className="size-7 shrink-0"
            disabled={activeTab.loading}
            aria-label="Search inside workspace"
          >
            {activeTab.loading ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <Search className="size-3.5" />
            )}
          </Button>
        </form>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              onClick={() => openExternally(externalUrl)}
              aria-label="Open externally"
            >
              <ExternalLink className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Open in a real browser tab</TooltipContent>
        </Tooltip>
      </div>

      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-2 py-1">
        {QUICK_LINKS.map((link) => (
          <Button
            key={link.url}
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void openUrl(link.url, true)}
            className="h-6 shrink-0 px-2 text-mono-xs text-muted-foreground"
          >
            {link.label}
          </Button>
        ))}
      </div>

      <div className="relative min-h-0 flex-1 overflow-auto bg-background" onClick={onPanelClick}>
        {activeTab.loading ? (
          <div className="absolute inset-0 z-10 grid place-items-center bg-background/80">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" /> Loading inside CodeStudy…
            </div>
          </div>
        ) : null}
        {activeTab.error ? (
          <div className="mx-auto mt-5 flex max-w-xl items-center justify-between gap-3 rounded-md border border-border bg-surface p-3 text-xs text-muted-foreground">
            <span>{activeTab.error}</span>
            <Button size="sm" variant="secondary" onClick={reload}>
              Retry
            </Button>
          </div>
        ) : null}

        {current.kind === "pending" && !activeTab.loading && !activeTab.error ? (
          <div className="grid min-h-[220px] place-items-center text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <LoaderCircle className="size-4 animate-spin" /> Restoring {hostOf(current.url)}…
            </div>
          </div>
        ) : null}

        {current.kind === "frame" || (current.kind === "home" && current.mode === "frame") ? (
          <iframe
            key={`${current.url}-${reloadKey}`}
            src={current.url}
            title="CodeStudy documentation browser"
            className="h-full min-h-[420px] w-full border-0 bg-background"
            allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; storage-access"
            referrerPolicy="no-referrer-when-downgrade"
          />
        ) : null}

        {current.kind === "home" && current.mode === "google" ? (
          <main className="mx-auto flex min-h-full w-full max-w-3xl flex-col items-center justify-center px-5 py-12">
            <div className="mb-7 select-none text-center" aria-label="Google search">
              <div className="text-4xl font-semibold text-foreground sm:text-5xl">Google</div>
              <p className="mt-2 text-xs text-muted-foreground">
                Search without leaving your lesson
              </p>
            </div>
            <form
              className="flex w-full max-w-xl items-center gap-2 rounded-full border border-border bg-surface p-1.5 pl-4 shadow-sm focus-within:border-primary"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const query = String(form.get("google-query") ?? "").trim();
                if (query) void runSearch(query);
              }}
            >
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <Input
                name="google-query"
                autoFocus
                placeholder="Search Google"
                className="h-9 flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
                aria-label="Search Google inside CodeStudy"
              />
              <Button
                type="submit"
                size="icon"
                className="size-9 shrink-0 rounded-full"
                aria-label="Search Google"
              >
                <Search className="size-4" />
              </Button>
            </form>
            <div className="mt-8 flex max-w-xl flex-wrap justify-center gap-2">
              {QUICK_LINKS.slice(0, 4).map((link) => (
                <Button
                  key={link.url}
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void openUrl(link.url, true)}
                  className="text-xs"
                >
                  {link.label}
                </Button>
              ))}
            </div>
          </main>
        ) : null}

        {current.kind === "results" ? (
          <main className="mx-auto max-w-3xl px-5 py-6">
            <div className="mb-5">
              <p className="text-mono-xs uppercase text-muted-foreground">Search results</p>
              <h2 className="mt-1 text-lg font-semibold text-foreground">{current.query}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Every result opens in a new tab of this in-app browser.
              </p>
            </div>
            <div className="divide-y divide-border rounded-md border border-border bg-surface">
              {!current.results.length ? (
                <div className="px-5 py-10 text-center">
                  <Search className="mx-auto size-5 text-muted-foreground" />
                  <p className="mt-3 text-sm font-medium text-foreground">No matching results</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Try fewer or different keywords.
                  </p>
                </div>
              ) : null}
              {current.results.map((result) => (
                <button
                  key={result.url}
                  type="button"
                  onClick={() => void openUrl(result.url, true)}
                  onAuxClick={(event) => {
                    if (event.button === 1) void openUrl(result.url, true);
                  }}
                  className="block w-full p-4 text-left transition-colors hover:bg-elevated"
                >
                  <span className="block truncate text-mono-xs text-muted-foreground">
                    {hostOf(result.url)}
                  </span>
                  <span className="mt-1 block text-sm font-medium text-primary">
                    {result.title}
                  </span>
                  <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground">
                    {result.description}
                  </span>
                </button>
              ))}
            </div>
          </main>
        ) : null}

        {current.kind === "reader" ? (
          <article className="mx-auto max-w-3xl px-6 py-8">
            <div className="mb-6 border-b border-border pb-5">
              <p className="text-mono-xs text-primary">{current.document.site}</p>
              <h1 className="mt-2 text-2xl font-semibold text-foreground">
                {current.document.title}
              </h1>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => openExternally(current.url)}
                >
                  <ExternalLink className="size-3.5" /> Original page
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => void runSearch(current.document.title || hostOf(current.url))}
                >
                  <Search className="size-3.5" /> Search this topic
                </Button>
              </div>
            </div>
            {current.document.blocked ? (
              <div className="rounded-md border border-border bg-surface p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">This site blocks in-app reading</p>
                <p className="mt-1 text-xs">{current.document.text}</p>
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-3 gap-1.5"
                  onClick={() => openExternally(current.url)}
                >
                  <ExternalLink className="size-3.5" /> Open in a real browser tab
                </Button>
              </div>
            ) : (
              <div className="whitespace-pre-line text-sm leading-7 text-foreground/90">
                {current.document.text}
              </div>
            )}
            {current.document.links?.length ? (
              <div className="mt-8 border-t border-border pt-5">
                <p className="text-mono-xs uppercase text-muted-foreground">Links on this page</p>
                <div className="mt-3 grid gap-1.5">
                  {current.document.links.slice(0, 25).map((link) => (
                    <button
                      key={link.url}
                      type="button"
                      onClick={() => void openUrl(link.url, true)}
                      className="truncate rounded-md px-2 py-1 text-left text-xs text-primary hover:bg-elevated"
                    >
                      {link.title || link.url}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </article>
        ) : null}
      </div>
    </div>
  );
}
