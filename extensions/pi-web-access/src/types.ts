export interface CachedUrlEntry {
  url: string;
  query?: string;
  content: string;
  contentType: string;
  fetchedAt: number;
}

export interface CachedResponse {
  responseId: string;
  createdAt: number;
  tool: string;
  entries: CachedUrlEntry[];
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface ExtractedContent {
  url: string;
  title?: string;
  content: string;
  contentType: string;
  truncated: boolean;
  fullLength: number;
  savedPath?: string;
  meta?: Record<string, unknown>;
}

export const TRUNCATE_CHARS = 30_000;
export const HTTP_TIMEOUT_MS = 30_000;
export const MAX_CONCURRENCY = 3;
export const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
