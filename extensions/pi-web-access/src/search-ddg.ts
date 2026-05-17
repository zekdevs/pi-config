import { parseHTML } from "linkedom";
import { bodyToText, httpGet } from "./http.ts";
import { cleanInlineText } from "./to-markdown.ts";
import type { SearchResult } from "./types.ts";

const DDG_ENDPOINT = "https://html.duckduckgo.com/html/";

export interface DdgSearchOptions {
  numResults: number;
  domainFilter?: string[];
  recencyFilter?: "day" | "week" | "month" | "year";
  signal?: AbortSignal;
}

function buildQuery(query: string, domainFilter?: string[]): string {
  if (!domainFilter?.length) return query;
  const ops: string[] = [];
  for (const raw of domainFilter) {
    const d = raw.trim();
    if (!d) continue;
    if (d.startsWith("-")) ops.push(`-site:${d.slice(1)}`);
    else ops.push(`site:${d}`);
  }
  return ops.length ? `${query} ${ops.join(" ")}` : query;
}

function recencyParam(r?: string): string | undefined {
  switch (r) {
    case "day":
      return "d";
    case "week":
      return "w";
    case "month":
      return "m";
    case "year":
      return "y";
    default:
      return undefined;
  }
}

function unwrapDdgUrl(href: string): string {
  try {
    if (href.startsWith("//duckduckgo.com/l/") || href.startsWith("/l/") || href.includes("duckduckgo.com/l/")) {
      const u = new URL(href.startsWith("//") ? `https:${href}` : href, "https://duckduckgo.com");
      const uddg = u.searchParams.get("uddg");
      if (uddg) return decodeURIComponent(uddg);
    }
    return href;
  } catch {
    return href;
  }
}

export async function ddgSearch(query: string, opts: DdgSearchOptions): Promise<SearchResult[]> {
  const finalQuery = buildQuery(query, opts.domainFilter);
  const params = new URLSearchParams({ q: finalQuery });
  const df = recencyParam(opts.recencyFilter);
  if (df) params.set("df", df);

  const res = await httpGet(`${DDG_ENDPOINT}?${params.toString()}`, {
    signal: opts.signal,
    headers: { Referer: "https://html.duckduckgo.com/" },
  });
  const html = bodyToText(res);
  const { document } = parseHTML(html);

  const results: SearchResult[] = [];
  const nodes = document.querySelectorAll("div.result, div.web-result");
  for (const node of nodes) {
    if (results.length >= opts.numResults) break;
    const titleEl = node.querySelector("a.result__a, h2 a");
    const snippetEl = node.querySelector(".result__snippet, .result-snippet");
    if (!titleEl) continue;
    const href = titleEl.getAttribute("href") ?? "";
    const url = unwrapDdgUrl(href);
    if (!url || !/^https?:/i.test(url)) continue;
    results.push({
      title: cleanInlineText((titleEl.textContent as string) ?? ""),
      url,
      snippet: cleanInlineText((snippetEl?.textContent as string) ?? ""),
    });
  }
  return results;
}
