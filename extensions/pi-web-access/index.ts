import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import pLimit from "p-limit";
import { fetchContentSchema, getSearchContentSchema, webSearchSchema } from "./src/schemas.ts";
import { ddgSearch } from "./src/search-ddg.ts";
import { routeAndFetch } from "./src/route.ts";
import { cleanupOldEntries, loadResponse, saveResponse } from "./src/storage.ts";
import { MAX_CONCURRENCY, TRUNCATE_CHARS, type CachedUrlEntry, type ExtractedContent, type SearchResult } from "./src/types.ts";

function truncate(content: string): { text: string; truncated: boolean } {
  if (content.length <= TRUNCATE_CHARS) return { text: content, truncated: false };
  return {
    text: `${content.slice(0, TRUNCATE_CHARS)}\n\n[... truncated; ${content.length - TRUNCATE_CHARS} more chars. Use get_search_content with this responseId to retrieve the full content.]`,
    truncated: true,
  };
}

function formatSearchResults(query: string, results: SearchResult[]): string {
  if (!results.length) return `# Search results: ${query}\n\n_No results._\n`;
  const lines = [`# Search results: ${query}`, ""];
  results.forEach((r, i) => {
    lines.push(`${i + 1}. **${r.title || "(no title)"}** — ${r.url}`);
    if (r.snippet) lines.push(`   ${r.snippet}`);
    lines.push("");
  });
  return lines.join("\n");
}

function formatExtracted(extracted: ExtractedContent): string {
  const head = `## ${extracted.url}`;
  const meta: string[] = [];
  if (extracted.title) meta.push(`**Title:** ${extracted.title}`);
  meta.push(`**Type:** ${extracted.contentType}`);
  if (extracted.savedPath) meta.push(`**Saved:** ${extracted.savedPath}`);
  meta.push(`**Length:** ${extracted.fullLength} chars`);
  const { text, truncated } = truncate(extracted.content);
  return `${head}\n\n${meta.join("  \n")}\n\n${text}${truncated ? "" : ""}`;
}

async function fetchInParallel<T>(items: T[], fn: (item: T) => Promise<ExtractedContent>): Promise<Array<ExtractedContent | { error: string; url: string }>> {
  const limit = pLimit(MAX_CONCURRENCY);
  return Promise.all(
    items.map((item) =>
      limit(async () => {
        try {
          return await fn(item);
        } catch (err: any) {
          return { error: err?.message ?? String(err), url: String(item) };
        }
      }),
    ),
  );
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "web_search",
    label: "web search",
    description:
      "Search the web via DuckDuckGo (no API key). Supports a single `query` or batch `queries`, domain filtering (use '-domain' to exclude), recency filter, and optional `includeContent` to fetch+extract the top results in the same call. Returns markdown the calling agent can summarize itself.",
    promptSnippet:
      "Search the web via DuckDuckGo (no API key). Supply `query` or `queries[]`. Use `includeContent:true` to also fetch page content.",
    promptGuidelines: [
      "Prefer a single focused `query`; use `queries[]` only when truly batching distinct topics",
      "Use `domainFilter: ['-pinterest.com']` to exclude noisy domains",
      "Set `includeContent:true` only when you need to read the pages, not just discover them",
      "Use the returned `responseId` with `get_search_content` to retrieve untruncated page content",
    ],
    parameters: webSearchSchema,

    async execute(toolCallId, params, signal, _onUpdate, _ctx) {
      await cleanupOldEntries();

      const queries: string[] = [];
      if (params.query) queries.push(params.query);
      if (params.queries) queries.push(...params.queries);
      if (!queries.length) throw new Error("Provide `query` or `queries`.");
      if (queries.length > 8) throw new Error("Maximum 8 queries per call.");

      const numResults = Math.min(params.numResults ?? 5, 20);
      const includeContent = params.includeContent ?? false;

      const sections: string[] = [];
      const cacheEntries: CachedUrlEntry[] = [];

      for (const q of queries) {
        const results = await ddgSearch(q, {
          numResults,
          domainFilter: params.domainFilter,
          recencyFilter: params.recencyFilter,
          signal,
        });

        sections.push(formatSearchResults(q, results));

        if (includeContent && results.length) {
          const extracted = await fetchInParallel(results, (r) =>
            routeAndFetch(r.url, { signal, cwd: _ctx.cwd }),
          );
          for (const ex of extracted) {
            if ("error" in ex) {
              sections.push(`### Failed: ${ex.url}\n\n${ex.error}`);
              continue;
            }
            sections.push(formatExtracted(ex));
            cacheEntries.push({
              url: ex.url,
              query: q,
              content: ex.content,
              contentType: ex.contentType,
              fetchedAt: Date.now(),
            });
          }
        } else {
          for (const r of results) {
            cacheEntries.push({
              url: r.url,
              query: q,
              content: `${r.title}\n\n${r.snippet}`,
              contentType: "search-snippet",
              fetchedAt: Date.now(),
            });
          }
        }
      }

      const responseId = await saveResponse("web_search", cacheEntries);
      const body = `${sections.join("\n\n")}\n\n---\n_responseId: \`${responseId}\` (use with \`get_search_content\` for full content)_`;

      return {
        content: [{ type: "text" as const, text: body }],
        details: { responseId, queryCount: queries.length, resultCount: cacheEntries.length },
      };
    },
  });

  pi.registerTool({
    name: "fetch_content",
    label: "fetch content",
    description:
      "Fetch and extract content from one or more URLs (or local file paths). Routes by content type: PDFs (unpdf) and HTML pages (Readability + Jina Reader fallback). Plain text, JSON, and Markdown pass through with appropriate markdown wrapping. Always returns markdown.",
    promptSnippet:
      "Fetch one or many URLs (or local files). Returns extracted markdown with a responseId for retrieving untruncated content.",
    promptGuidelines: [
      "Use `urls[]` for batch fetching — runs in parallel (max 3 concurrent)",
      "Local file paths (absolute, ./, ../, or file://) are supported",
      "Use the returned `responseId` with `get_search_content` to retrieve untruncated content",
    ],
    parameters: fetchContentSchema,

    async execute(toolCallId, params, signal, _onUpdate, ctx) {
      await cleanupOldEntries();

      const urls: string[] = [];
      if (params.url) urls.push(params.url);
      if (params.urls) urls.push(...params.urls);
      if (!urls.length) throw new Error("Provide `url` or `urls`.");
      if (urls.length > 8) throw new Error("Maximum 8 URLs per call.");

      const extracted = await fetchInParallel(urls, (u) =>
        routeAndFetch(u, { signal, cwd: ctx.cwd }),
      );

      const sections: string[] = [];
      const cacheEntries: CachedUrlEntry[] = [];
      for (const ex of extracted) {
        if ("error" in ex) {
          sections.push(`## ${ex.url}\n\n**Error:** ${ex.error}`);
          continue;
        }
        sections.push(formatExtracted(ex));
        cacheEntries.push({
          url: ex.url,
          content: ex.content,
          contentType: ex.contentType,
          fetchedAt: Date.now(),
        });
      }

      const responseId = await saveResponse("fetch_content", cacheEntries);
      const body = `${sections.join("\n\n")}\n\n---\n_responseId: \`${responseId}\`_`;

      return {
        content: [{ type: "text" as const, text: body }],
        details: { responseId, urlCount: urls.length },
      };
    },
  });

  pi.registerTool({
    name: "get_search_content",
    label: "get cached content",
    description:
      "Retrieve the full untruncated content of a cached URL from a previous web_search or fetch_content call. Look up by `urlIndex`, `url`, or `query`.",
    promptSnippet:
      "Retrieve full untruncated content from a previous web_search or fetch_content call by responseId + (urlIndex|url|query).",
    promptGuidelines: [
      "Use this when a previous response was truncated and you need the full content",
      "Cache entries expire after 24h",
    ],
    parameters: getSearchContentSchema,

    async execute(toolCallId, params, _signal, _onUpdate, _ctx) {
      const cached = await loadResponse(params.responseId);
      if (!cached) {
        throw new Error(
          `No cached response for responseId='${params.responseId}'. It may have expired (>24h) or never existed.`,
        );
      }

      let entry: CachedUrlEntry | undefined;
      if (typeof params.urlIndex === "number") {
        entry = cached.entries[params.urlIndex];
      } else if (params.url) {
        entry = cached.entries.find((e) => e.url === params.url);
      } else if (params.query) {
        entry = cached.entries.find((e) => e.query === params.query);
      } else {
        throw new Error("Provide one of: urlIndex, url, or query.");
      }

      if (!entry) {
        const index = cached.entries.map((e, i) => `  ${i}. ${e.url}${e.query ? ` (q='${e.query}')` : ""}`).join("\n");
        throw new Error(`Entry not found in response ${params.responseId}.\nAvailable entries:\n${index}`);
      }

      const head = `# Cached content: ${entry.url}\n\n**Type:** ${entry.contentType}  \n**Length:** ${entry.content.length} chars  \n**Fetched:** ${new Date(entry.fetchedAt).toISOString()}\n\n`;

      return {
        content: [{ type: "text" as const, text: `${head}${entry.content}` }],
        details: {
          responseId: params.responseId,
          url: entry.url,
          contentType: entry.contentType,
          length: entry.content.length,
        },
      };
    },
  });
}
