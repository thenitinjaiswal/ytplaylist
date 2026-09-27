const decodeEntities = (value) =>
  value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
const stripHtml = (value) =>
  decodeEntities(
    value
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
function safeWebUrl(raw) {
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only web pages can be opened.");
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".local") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  )
    throw new Error("That address cannot be opened.");
  return url;
}
const BROWSER_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
};
async function fetchPage(url, headers = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { ...BROWSER_HEADERS, ...headers },
    });
    if (!response.ok) throw new Error(`Page returned ${response.status}.`);
    return response;
  } finally {
    clearTimeout(timeout);
  }
}
/** Some sites reject server-side requests (403/429). Fall back to a public text-extraction proxy. */
async function fetchReaderProxy(url) {
  const proxied = new URL(`https://r.jina.ai/${url.toString()}`);
  const response = await fetchPage(proxied, { accept: "text/plain,*/*;q=0.8" });
  return response.text();
}
const SEARXNG_INSTANCES = [
  "https://searx.be/search",
  "https://search.disroot.org/search",
  "https://searx.priv.in/search",
];

export async function searchWeb(query) {
  // Tier 1: SearXNG Privacy-Preserving Metasearch (Google + Bing + DuckDuckGo aggregation)
  for (const instance of SEARXNG_INSTANCES) {
    try {
      const endpoint = new URL(instance);
      endpoint.searchParams.set("q", query);
      endpoint.searchParams.set("format", "json");
      endpoint.searchParams.set("language", "en");

      const response = await fetchPage(endpoint);
      const data = await response.json();
      if (Array.isArray(data.results) && data.results.length > 0) {
        const results = data.results
          .slice(0, 12)
          .map((item) => ({
            title: stripHtml(item.title || ""),
            url: item.url,
            description: stripHtml(item.content || item.snippet || ""),
          }))
          .filter((res) => res.title && res.url);
        if (results.length) return results;
      }
    } catch {
      // Try next SearXNG instance on failure or timeout
    }
  }

  // Tier 2: Bing Search RSS Fallback
  try {
    const endpoint = new URL("https://www.bing.com/search");
    endpoint.searchParams.set("q", query);
    endpoint.searchParams.set("format", "rss");
    endpoint.searchParams.set("setlang", "en-US");
    endpoint.searchParams.set("cc", "US");
    const xml = await (await fetchPage(endpoint)).text();
    const results = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
      .slice(0, 10)
      .map((match) => {
        const item = match[1] ?? "";
        const read = (tag) =>
          item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1] ?? "";
        return {
          title: stripHtml(read("title")),
          url: decodeEntities(read("link")).trim(),
          description: stripHtml(read("description")),
        };
      })
      .filter((result) => result.title && result.url);
    if (results.length) return results;
  } catch {
    // Continue to public fallback
  }

  // Tier 3: Wikipedia OpenSearch Universal Fallback
  const fallback = new URL("https://en.wikipedia.org/w/api.php");
  fallback.searchParams.set("action", "opensearch");
  fallback.searchParams.set("search", query);
  fallback.searchParams.set("limit", "10");
  fallback.searchParams.set("namespace", "0");
  fallback.searchParams.set("format", "json");
  fallback.searchParams.set("origin", "*");
  const response = await fetchPage(fallback);
  const payload = await response.json();
  const titles = Array.isArray(payload[1]) ? payload[1] : [];
  const descriptions = Array.isArray(payload[2]) ? payload[2] : [];
  const urls = Array.isArray(payload[3]) ? payload[3] : [];
  return titles
    .map((title, index) => ({
      title,
      description: descriptions[index] ?? "",
      url: urls[index] ?? "",
    }))
    .filter((result) => result.title && result.url);
}
/** Collects absolute http(s) links from a page so the reader can open them in in-app tabs. */
function extractLinks(html, base) {
  const found = new Map();
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = match[1] ?? "";
    const label = stripHtml(match[2] ?? "")
      .replace(/\s+/g, " ")
      .trim();
    if (!label || label.length > 120) continue;
    let absolute;
    try {
      absolute = new URL(href, base);
    } catch {
      continue;
    }
    if (absolute.protocol !== "http:" && absolute.protocol !== "https:") continue;
    const key = absolute.toString();
    if (!found.has(key)) found.set(key, label);
    if (found.size >= 60) break;
  }
  return [...found].map(([url, title]) => ({ title, url }));
}
export async function readWebPage(rawUrl) {
  const requested = safeWebUrl(rawUrl);
  let response;
  try {
    response = await fetchPage(requested);
  } catch (error) {
    // Blocked by the site (403/429/timeouts) — try the text proxy, else return a readable notice.
    const proxied = await fetchReaderProxy(requested).catch(() => null);
    if (!proxied) {
      const blockedByHost = error instanceof Error && /40[13]|429/.test(error.message);
      return {
        title: requested.hostname.replace(/^www\./, ""),
        url: requested.toString(),
        site: requested.hostname.replace(/^www\./, ""),
        blocked: true,
        text: blockedByHost
          ? `${requested.hostname} does not allow in-app reading of this page.\n\nUse “Open externally” to view it in a real browser tab, or search again to pick another result.`
          : `This page could not be loaded right now.\n\nCheck the address, try again, or use “Open externally”.`,
      };
    }
    const cleaned = decodeEntities(proxied).replace(/\r/g, "").trim().slice(0, 40_000);
    const firstLine =
      cleaned.split("\n").find((line) => line.trim().length > 0) ?? requested.hostname;
    return {
      title: firstLine.replace(/^Title:\s*/i, "").slice(0, 200),
      url: requested.toString(),
      site: requested.hostname.replace(/^www\./, ""),
      text: cleaned,
    };
  }
  const finalUrl = safeWebUrl(response.url);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
    throw new Error("This file type cannot be shown in the reader.");
  }
  const html = (await response.text()).slice(0, 1_500_000);
  const title = stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? finalUrl.hostname);
  const text = stripHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
      .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
      .replace(/<\/(p|div|article|section|h[1-6]|li)>/gi, "\n\n")
      .replace(/<br\s*\/?>/gi, "\n"),
  ).slice(0, 40_000);
  if (!text) throw new Error("No readable content was found on this page.");
  return {
    title,
    url: finalUrl.toString(),
    site: finalUrl.hostname.replace(/^www\./, ""),
    text,
    links: extractLinks(html, finalUrl),
  };
}
