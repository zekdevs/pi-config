import { readFile, stat } from "node:fs/promises";
import { basename, extname, isAbsolute, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { bodyToText, httpGet } from "./http.ts";
import { extractHtml } from "./extract-html.ts";
import { extractPdfFromBuffer, extractPdfFromResponse } from "./extract-pdf.ts";
import {
  isMarkdownExtension,
  langForExtension,
  normalizeMarkdown,
  toMarkdown,
  wrapAsCode,
} from "./to-markdown.ts";
import type { ExtractedContent } from "./types.ts";

export interface RouteOptions {
  signal?: AbortSignal;
  cwd: string;
}

function isLocalPath(input: string): boolean {
  if (input.startsWith("file://")) return true;
  if (input.startsWith("/") || input.startsWith("./") || input.startsWith("../") || input.startsWith("~/")) return true;
  return false;
}

async function fetchLocal(input: string, cwd: string): Promise<ExtractedContent> {
  let path = input;
  if (path.startsWith("file://")) path = fileURLToPath(path);
  if (path.startsWith("~/")) path = path.replace(/^~/, process.env.HOME ?? "");
  if (!isAbsolute(path)) path = resolvePath(cwd, path);

  const s = await stat(path);
  if (s.isDirectory()) {
    const content = `# ${path}\n\n_Directory listing not supported._\n`;
    return {
      url: path,
      title: basename(path),
      content,
      contentType: "local-dir",
      truncated: false,
      fullLength: content.length,
    };
  }

  const ext = extname(path).toLowerCase();
  const title = basename(path);

  if (ext === ".pdf") {
    const buf = await readFile(path);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    return extractPdfFromBuffer(path, ab, new Headers());
  }

  if (isMarkdownExtension(ext)) {
    const raw = await readFile(path, "utf-8");
    const content = normalizeMarkdown(raw);
    return {
      url: path,
      title,
      content,
      contentType: "markdown",
      truncated: false,
      fullLength: content.length,
    };
  }

  if (ext === ".json") {
    const raw = await readFile(path, "utf-8");
    const content = wrapAsCode(raw, "json", title);
    return {
      url: path,
      title,
      content,
      contentType: "json",
      truncated: false,
      fullLength: content.length,
    };
  }

  const textExts = new Set([
    ".txt", ".log", ".csv", ".tsv", ".yaml", ".yml", ".xml", ".html", ".htm",
    ".ts", ".tsx", ".js", ".jsx", ".py", ".sh", ".bash", ".rs", ".go", ".java",
    ".rb", ".php", ".css", ".sql", ".toml", ".ini",
  ]);

  if (textExts.has(ext)) {
    const raw = await readFile(path, "utf-8");
    const content = wrapAsCode(raw, langForExtension(ext), title);
    return {
      url: path,
      title,
      content,
      contentType: `local-text${ext}`,
      truncated: false,
      fullLength: content.length,
    };
  }

  const meta = `**Path:** ${path}  \n**Size:** ${s.size} bytes  \n**Extension:** ${ext || "(none)"}`;
  const content = `# ${title}\n\n${meta}\n\n_Binary or unsupported file type; contents not displayed._\n`;
  return {
    url: path,
    title,
    content,
    contentType: "local-binary",
    truncated: false,
    fullLength: content.length,
  };
}

export async function routeAndFetch(input: string, opts: RouteOptions): Promise<ExtractedContent> {
  if (isLocalPath(input)) return fetchLocal(input, opts.cwd);

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error(`Invalid URL or path: ${input}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unsupported protocol: ${url.protocol}`);
  }

  const lowerPath = url.pathname.toLowerCase();
  if (lowerPath.endsWith(".pdf")) {
    const res = await httpGet(input, { signal: opts.signal });
    return extractPdfFromResponse(input, res);
  }

  if (lowerPath.endsWith(".md") || lowerPath.endsWith(".markdown")) {
    const res = await httpGet(input, { signal: opts.signal });
    const content = normalizeMarkdown(bodyToText(res));
    return {
      url: input,
      title: input,
      content,
      contentType: "markdown",
      truncated: false,
      fullLength: content.length,
    };
  }

  const res = await httpGet(input, { signal: opts.signal });
  const ct = res.contentType;

  if (ct.includes("application/pdf") || ct.includes("application/x-pdf")) {
    return extractPdfFromResponse(input, res);
  }

  if (ct.includes("text/markdown")) {
    const content = normalizeMarkdown(bodyToText(res));
    return {
      url: input,
      title: input,
      content,
      contentType: "markdown",
      truncated: false,
      fullLength: content.length,
    };
  }

  if (ct.includes("application/json")) {
    const content = toMarkdown(bodyToText(res), "json", input);
    return {
      url: input,
      title: input,
      content,
      contentType: "json",
      truncated: false,
      fullLength: content.length,
    };
  }

  if (
    ct.includes("text/plain") ||
    ct.includes("text/x-") ||
    ct.includes("application/yaml") ||
    ct.includes("application/x-yaml")
  ) {
    const lang = ct.includes("yaml") ? "yaml" : "text";
    const content = toMarkdown(bodyToText(res), lang, input);
    return {
      url: input,
      title: input,
      content,
      contentType: lang,
      truncated: false,
      fullLength: content.length,
    };
  }

  if (ct.includes("text/html") || ct.includes("application/xhtml") || ct === "" || !ct) {
    return extractHtml(input, res, opts.signal);
  }

  const text = bodyToText(res);
  const content = text ? toMarkdown(text, "text", input) : `# ${input}\n\n_Unsupported content-type: ${ct}_\n`;
  return {
    url: input,
    title: input,
    content,
    contentType: ct || "unknown",
    truncated: false,
    fullLength: content.length,
  };
}
