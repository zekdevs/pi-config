import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
import { bodyToText, httpGet, type HttpResponse } from "./http.ts";
import { normalizeMarkdown } from "./to-markdown.ts";
import type { ExtractedContent } from "./types.ts";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
  emDelimiter: "*",
});
turndown.remove(["script", "style", "noscript", "iframe"]);

turndown.addRule("strikethrough", {
  filter: ["del", "s", "strike"] as any,
  replacement: (content) => `~~${content}~~`,
});

turndown.addRule("fencedCodeBlock", {
  filter: (node: any) =>
    node.nodeName === "PRE" && node.firstChild && node.firstChild.nodeName === "CODE",
  replacement: (_content, node: any) => {
    const codeEl = node.firstChild;
    const className = (codeEl.getAttribute && codeEl.getAttribute("class")) || "";
    const langMatch = className.match(/(?:language|lang)-([\w+-]+)/);
    const lang = langMatch ? langMatch[1] : "";
    const text = (codeEl.textContent ?? "").replace(/\n+$/, "");
    return `\n\n\`\`\`${lang}\n${text}\n\`\`\`\n\n`;
  },
});

function cellText(cell: any): string {
  return (cell.textContent ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

turndown.addRule("gfmTable", {
  filter: "table" as any,
  replacement: (_content, node: any) => {
    const rows = Array.from(node.querySelectorAll("tr")) as any[];
    if (!rows.length) return "";

    const matrix: string[][] = [];
    let headerIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const cells = Array.from(row.querySelectorAll("th,td")) as any[];
      if (!cells.length) continue;
      if (headerIdx === -1 && cells.some((c) => c.nodeName === "TH")) headerIdx = matrix.length;
      matrix.push(cells.map(cellText));
    }
    if (!matrix.length) return "";
    if (headerIdx === -1) headerIdx = 0;

    const colCount = Math.max(...matrix.map((r) => r.length));
    for (const r of matrix) while (r.length < colCount) r.push("");

    const lines: string[] = [];
    const header = matrix[headerIdx];
    lines.push(`| ${header.join(" | ")} |`);
    lines.push(`| ${header.map(() => "---").join(" | ")} |`);
    for (let i = 0; i < matrix.length; i++) {
      if (i === headerIdx) continue;
      lines.push(`| ${matrix[i].join(" | ")} |`);
    }
    return `\n\n${lines.join("\n")}\n\n`;
  },
});

const MIN_USEFUL_CHARS = 200;
const COOKIE_WALL_HINTS = [
  "enable javascript",
  "please enable js",
  "you need to enable javascript",
  "accept cookies",
  "this site requires cookies",
  "captcha",
];

function looksLikeCookieWall(text: string): boolean {
  const lower = text.toLowerCase();
  return COOKIE_WALL_HINTS.some((h) => lower.includes(h)) && text.length < 1500;
}

function readabilityExtract(html: string, url: string): { title?: string; markdown: string } | null {
  try {
    const { document } = parseHTML(html);
    if (typeof (document as any).baseURI === "undefined") {
      try {
        Object.defineProperty(document, "baseURI", { value: url, configurable: true });
      } catch {
        /* ignore */
      }
    }
    const article = new Readability(document as any).parse();
    if (!article || !article.content) return null;
    const markdown = normalizeMarkdown(turndown.turndown(article.content));
    if (!markdown) return null;
    return { title: article.title ?? undefined, markdown };
  } catch {
    return null;
  }
}

async function jinaFallback(url: string, signal?: AbortSignal): Promise<{ markdown: string; title?: string } | null> {
  try {
    const res = await httpGet(`https://r.jina.ai/${url}`, {
      signal,
      headers: { Accept: "text/markdown, text/plain;q=0.9, */*;q=0.5" },
    });
    if (res.status >= 400) return null;
    const text = bodyToText(res).trim();
    if (!text) return null;
    const titleMatch = text.match(/^Title:\s*(.+)$/m);
    return { markdown: normalizeMarkdown(text), title: titleMatch?.[1]?.trim() };
  } catch {
    return null;
  }
}

export async function extractHtml(url: string, res: HttpResponse, signal?: AbortSignal): Promise<ExtractedContent> {
  const html = bodyToText(res);
  let title: string | undefined;
  let markdown = "";

  const primary = readabilityExtract(html, url);
  if (primary) {
    title = primary.title;
    markdown = primary.markdown;
  }

  if (markdown.length < MIN_USEFUL_CHARS || looksLikeCookieWall(markdown)) {
    const fallback = await jinaFallback(url, signal);
    if (fallback && fallback.markdown.length > markdown.length) {
      markdown = fallback.markdown;
      title = title ?? fallback.title;
    }
  }

  if (!markdown) {
    const { document } = parseHTML(html);
    const titleTag = document.querySelector("title")?.textContent?.trim();
    title = title ?? titleTag;
    const text = (document.body?.textContent ?? "").replace(/\s+\n/g, "\n");
    markdown = normalizeMarkdown(text);
  }

  return {
    url,
    title,
    content: markdown,
    contentType: "html",
    truncated: false,
    fullLength: markdown.length,
  };
}
