import type {
  ExtensionAPI,
  ToolCallEvent,
  ToolResultEvent,
  ToolResultEventResult,
} from "@earendil-works/pi-coding-agent";
import { spawnSync } from "child_process";

const RTK_BIN = process.env.RTK_BIN || "rtk";
const DISABLE = process.env.PI_RTK_DISABLE === "1";
const DISABLE_REWRITE = process.env.PI_RTK_NO_REWRITE === "1";
const DISABLE_COMPACT = process.env.PI_RTK_NO_COMPACT === "1";
const STRIP_ANSI = process.env.PI_RTK_NO_ANSI !== "1";
const GROUP_GREP = process.env.PI_RTK_NO_GREP_GROUP !== "1";
const MAX_CHARS = clampInt(process.env.PI_RTK_MAX_CHARS, 12000, 1000, 200000);
const MAX_LINES = clampInt(process.env.PI_RTK_MAX_LINES, 0, 0, 100000);

const COMPACT_TOOLS = new Set(["$", "bash", "read", "grep", "find", "ls"]);
const SKIP_REWRITE_COMMANDS = new Set<string>();

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function firstCommandWord(command: string): string {
  const trimmed = command.trimStart();
  const match = trimmed.match(/^(?:[A-Z_][A-Z0-9_]*=\S*\s+)*([^\s;|&<>]+)/);
  if (!match) return "";
  const word = match[1];
  const slash = word.lastIndexOf("/");
  return slash >= 0 ? word.slice(slash + 1) : word;
}

let rtkAvailable: boolean | null = null;
function rtkIsAvailable(): boolean {
  if (rtkAvailable !== null) return rtkAvailable;
  const res = spawnSync(RTK_BIN, ["--version"], { stdio: "ignore" });
  rtkAvailable = res.status === 0;
  return rtkAvailable;
}

function rewriteCommand(command: string): string | null {
  if (DISABLE || DISABLE_REWRITE || !command || !command.trim()) return null;
  if (SKIP_REWRITE_COMMANDS.has(firstCommandWord(command))) return null;
  if (!rtkIsAvailable()) return null;
  const res = spawnSync(RTK_BIN, ["rewrite", command], {
    encoding: "utf8",
    timeout: 1500,
  });
  const rewritten = (res.stdout || "").trim();
  if (!rewritten) return null;
  if (rewritten === command.trim()) return null;
  return rewritten;
}

const ANSI_RE = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;
function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, "");
}

const GREP_LINE_RE = /^(.+?):(\d+):(.*)$/;
function groupGrep(text: string): string {
  const lines = text.split("\n");
  const groups = new Map<string, string[]>();
  const passthrough: string[] = [];
  let matched = 0;
  for (const line of lines) {
    const m = line.match(GREP_LINE_RE);
    if (m) {
      matched++;
      const file = m[1];
      const entry = `${m[2]}: ${m[3]}`;
      let arr = groups.get(file);
      if (!arr) {
        arr = [];
        groups.set(file, arr);
      }
      arr.push(entry);
    } else if (line.length > 0 || passthrough.length > 0) {
      passthrough.push(line);
    }
  }
  if (matched < 4 || groups.size < 2) return text;
  const out: string[] = [];
  for (const [file, entries] of groups) {
    out.push(file);
    for (const e of entries) out.push(`  ${e}`);
  }
  if (passthrough.some((l) => l.trim().length > 0)) {
    out.push("", ...passthrough.filter((l) => l.trim().length > 0));
  }
  return out.join("\n");
}

function truncateLines(text: string, maxLines: number): string {
  if (maxLines <= 0) return text;
  const lines = text.split("\n");
  if (lines.length <= maxLines) return text;
  const head = Math.floor(maxLines * 0.7);
  const tail = maxLines - head;
  const omitted = lines.length - maxLines;
  return [
    ...lines.slice(0, head),
    `... [${omitted} lines truncated by rtk-wrap] ...`,
    ...lines.slice(lines.length - tail),
  ].join("\n");
}

function truncateChars(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const head = Math.floor(maxChars * 0.7);
  const tail = maxChars - head - 80;
  const omitted = text.length - head - tail;
  return (
    text.slice(0, head) +
    `\n... [${omitted} chars truncated by rtk-wrap] ...\n` +
    text.slice(text.length - tail)
  );
}

function compactText(toolName: string, text: string): string {
  let out = text;
  if (STRIP_ANSI) out = stripAnsi(out);
  if (GROUP_GREP && toolName === "grep") out = groupGrep(out);
  if (MAX_LINES > 0) out = truncateLines(out, MAX_LINES);
  if (MAX_CHARS > 0) out = truncateChars(out, MAX_CHARS);
  return out;
}

function compactResult(event: ToolResultEvent): ToolResultEventResult | undefined {
  if (DISABLE || DISABLE_COMPACT) return undefined;
  if (!COMPACT_TOOLS.has(event.toolName)) return undefined;
  if (!Array.isArray(event.content) || event.content.length === 0) return undefined;
  let mutated = false;
  const next = event.content.map((part) => {
    if (part && (part as { type?: string }).type === "text") {
      const original = (part as { text: string }).text;
      const compacted = compactText(event.toolName, original);
      if (compacted !== original) {
        mutated = true;
        return { ...part, text: compacted };
      }
    }
    return part;
  });
  if (!mutated) return undefined;
  return { content: next };
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", (event: ToolCallEvent) => {
    if (event.toolName !== "$" && event.toolName !== "bash") return;
    const input = event.input as { command?: unknown };
    if (typeof input.command !== "string") return;
    const rewritten = rewriteCommand(input.command);
    if (rewritten !== null) {
      input.command = rewritten;
    }
  });

  pi.on("tool_result", (event: ToolResultEvent) => {
    return compactResult(event);
  });
}
