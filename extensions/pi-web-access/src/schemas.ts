import { Type } from "@sinclair/typebox";

export const webSearchSchema = Type.Object({
  query: Type.Optional(Type.String({ description: "A single search query." })),
  queries: Type.Optional(
    Type.Array(Type.String(), { description: "Multiple search queries to run in parallel (up to 8)." }),
  ),
  numResults: Type.Optional(
    Type.Integer({ minimum: 1, maximum: 20, default: 5, description: "Results per query (1-20). Default 5." }),
  ),
  domainFilter: Type.Optional(
    Type.Array(Type.String(), {
      description:
        "Restrict to domains. Prefix with '-' to exclude (e.g. '-pinterest.com'). Translated to DuckDuckGo site:/-site: operators.",
    }),
  ),
  recencyFilter: Type.Optional(
    Type.Union(
      [Type.Literal("day"), Type.Literal("week"), Type.Literal("month"), Type.Literal("year")],
      { description: "Time filter: day|week|month|year." },
    ),
  ),
  includeContent: Type.Optional(
    Type.Boolean({
      default: false,
      description: "If true, also fetch and extract content for each result (up to numResults).",
    }),
  ),
});

export const fetchContentSchema = Type.Object({
  url: Type.Optional(Type.String({ description: "A single URL or local file path." })),
  urls: Type.Optional(
    Type.Array(Type.String(), { description: "Multiple URLs / local paths to fetch in parallel (up to 8)." }),
  ),
});

export const getSearchContentSchema = Type.Object({
  responseId: Type.String({ description: "responseId returned by a previous web_search or fetch_content call." }),
  urlIndex: Type.Optional(Type.Integer({ minimum: 0, description: "0-based index into the cached entries." })),
  url: Type.Optional(Type.String({ description: "Look up by exact URL." })),
  query: Type.Optional(Type.String({ description: "Look up by associated query (web_search only)." })),
});
