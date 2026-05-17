const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  copy: "\u00a9",
  reg: "\u00ae",
  hellip: "\u2026",
  mdash: "\u2014",
  ndash: "\u2013",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201c",
  rdquo: "\u201d",
};

export function htmlDecode(input: string): string {
  if (!input) return input;
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X")) {
      const n = parseInt(code.slice(2), 16);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    if (code.startsWith("#")) {
      const n = parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    const named = NAMED_ENTITIES[code];
    return named ?? match;
  });
}

export function stripHtmlTags(input: string): string {
  if (!input) return input;
  return input.replace(/<[^>]*>/g, "");
}

export function cleanInlineText(input: string): string {
  return htmlDecode(stripHtmlTags(input)).replace(/\s+/g, " ").trim();
}

export function normalizeMarkdown(input: string): string {
  return input.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function extToLang(ext: string): string {
  switch (ext.toLowerCase()) {
    case ".json":
      return "json";
    case ".yaml":
    case ".yml":
      return "yaml";
    case ".xml":
      return "xml";
    case ".html":
    case ".htm":
      return "html";
    case ".ts":
      return "ts";
    case ".tsx":
      return "tsx";
    case ".js":
      return "js";
    case ".jsx":
      return "jsx";
    case ".py":
      return "python";
    case ".sh":
    case ".bash":
      return "bash";
    case ".rs":
      return "rust";
    case ".go":
      return "go";
    case ".java":
      return "java";
    case ".rb":
      return "ruby";
    case ".php":
      return "php";
    case ".css":
      return "css";
    case ".sql":
      return "sql";
    case ".toml":
      return "toml";
    case ".ini":
      return "ini";
    case ".csv":
      return "csv";
    case ".tsv":
      return "tsv";
    case ".log":
    case ".txt":
      return "text";
    default:
      return "text";
  }
}

export function wrapAsCode(content: string, lang: string, title?: string): string {
  const safe = content.replace(/```/g, "\u200b```");
  const head = title ? `# ${title}\n\n` : "";
  return `${head}\`\`\`${lang}\n${safe}\n\`\`\`\n`;
}

export function isMarkdownContentType(ct: string): boolean {
  const c = ct.toLowerCase();
  return c.includes("markdown") || c === "md" || c.endsWith("/md");
}

export function isMarkdownExtension(ext: string): boolean {
  const e = ext.toLowerCase();
  return e === ".md" || e === ".markdown";
}

export function langForExtension(ext: string): string {
  return extToLang(ext);
}

export function toMarkdown(content: string, contentType: string, sourceUrl: string): string {
  const ct = (contentType || "").toLowerCase();
  if (!content) return content;
  if (isMarkdownContentType(ct) || ct === "html" || ct === "pdf") {
    return normalizeMarkdown(content);
  }
  if (ct.includes("json")) return wrapAsCode(content, "json", sourceUrl);
  if (ct.includes("yaml")) return wrapAsCode(content, "yaml", sourceUrl);
  if (ct.includes("xml")) return wrapAsCode(content, "xml", sourceUrl);
  if (ct.includes("text") || ct === "" || ct === "unknown") {
    return wrapAsCode(content, "text", sourceUrl);
  }
  return wrapAsCode(content, "text", sourceUrl);
}
