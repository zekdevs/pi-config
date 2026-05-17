import { HTTP_TIMEOUT_MS, USER_AGENT } from "./types.ts";

export interface HttpResponse {
  url: string;
  status: number;
  headers: Headers;
  contentType: string;
  body: ArrayBuffer;
}

export async function httpGet(
  url: string,
  opts: { signal?: AbortSignal; timeoutMs?: number; headers?: Record<string, string> } = {},
): Promise<HttpResponse> {
  const timeoutMs = opts.timeoutMs ?? HTTP_TIMEOUT_MS;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error(`HTTP timeout after ${timeoutMs}ms: ${url}`)), timeoutMs);

  const linkAbort = () => ctrl.abort(opts.signal!.reason);
  if (opts.signal) {
    if (opts.signal.aborted) ctrl.abort(opts.signal.reason);
    else opts.signal.addEventListener("abort", linkAbort, { once: true });
  }

  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        ...(opts.headers ?? {}),
      },
    });
    const body = await res.arrayBuffer();
    return {
      url: res.url,
      status: res.status,
      headers: res.headers,
      contentType: (res.headers.get("content-type") ?? "").toLowerCase(),
      body,
    };
  } finally {
    clearTimeout(timer);
    if (opts.signal) opts.signal.removeEventListener("abort", linkAbort);
  }
}

export function bodyToText(res: HttpResponse): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(res.body);
}
