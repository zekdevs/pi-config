import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { extractText, getDocumentProxy } from "unpdf";
import type { HttpResponse } from "./http.ts";
import { normalizeMarkdown } from "./to-markdown.ts";
import type { ExtractedContent } from "./types.ts";

function sanitizeFilename(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120) || "document";
}

function deriveTitle(url: string, headers: Headers): string {
  const cd = headers.get("content-disposition") ?? "";
  const m = cd.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
  if (m) return decodeURIComponent(m[1].replace(/"$/, ""));
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop();
    if (last) return decodeURIComponent(last);
  } catch {
    /* ignore */
  }
  return "document.pdf";
}

function joinPages(pages: string[]): string {
  return pages
    .map((p) => p.replace(/\r\n/g, "\n").trim())
    .filter((p) => p.length > 0)
    .join("\n\n---\n\n");
}

export async function extractPdfFromBuffer(
  url: string,
  buffer: ArrayBuffer,
  headers: Headers,
): Promise<ExtractedContent> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];
  const body = normalizeMarkdown(joinPages(pages));

  const title = deriveTitle(url, headers);
  const baseName = sanitizeFilename(title.replace(/\.pdf$/i, ""));
  const outDir = join(homedir(), "Downloads", "pi-web-access");
  await mkdir(outDir, { recursive: true });
  const savedPath = join(outDir, `${baseName}.pdf.md`);

  const md = `# ${title}\n\n_Source: ${url}_\n\n${body}\n`;
  await writeFile(savedPath, md, "utf-8");

  return {
    url,
    title,
    content: md,
    contentType: "pdf",
    truncated: false,
    fullLength: md.length,
    savedPath,
    meta: { pages: pdf.numPages },
  };
}

export async function extractPdfFromResponse(url: string, res: HttpResponse): Promise<ExtractedContent> {
  return extractPdfFromBuffer(url, res.body, res.headers);
}
