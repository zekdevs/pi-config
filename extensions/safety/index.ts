/*
 * pi safety extension
 *
 * API:
 *   - Module default-exports a function that receives an `ExtensionAPI` instance.
 *   - Inside, register a `tool_call` handler. The event has `event.toolName` and
 *     `event.input`. Returning `{ block: true, reason }` is surfaced by pi.
 */

import type { ExtensionAPI, ToolCallEvent } from "@earendil-works/pi-coding-agent";

const DANGEROUS_BASH_TOOLS = new Set(["bash", "runInTerminal", "shell", "terminal"]);

const DANGEROUS_PATTERNS: { name: string; re: RegExp }[] = [
  { name: "rm -rf /",            re: /rm\s+-rf\s+\//i },
  { name: "rm -rf *",            re: /rm\s+-rf\s+\*/i },
  { name: "DROP TABLE",          re: /\bDROP\s+TABLE\b/i },
  { name: "DROP DATABASE",       re: /\bDROP\s+DATABASE\b/i },
  { name: "TRUNCATE",            re: /\bTRUNCATE\b/i },
  { name: "--no-verify",         re: /--no-verify\b/i },
  { name: "git push --force",    re: /\bgit\s+push\s+--force\b/i },
  { name: "git reset --hard",    re: /\bgit\s+reset\s+--hard\b/i },
  { name: "chmod 777",           re: /\bchmod\s+777\b/i },
  { name: "curl ... | sh",       re: /curl[^|]*\|\s*sh\b/i },
  { name: "wget ... | sh",       re: /wget[^|]*\|\s*sh\b/i },
];

function extractCommand(input: any): string {
  if (!input || typeof input !== "object") return "";
  if (typeof input.command === "string") return input.command;
  if (typeof input.script === "string") return input.script;
  return "";
}

function check(tool: string, input: any): { block: true; reason: string } | undefined {
  if (!DANGEROUS_BASH_TOOLS.has(tool)) return undefined;
  const cmd = extractCommand(input);
  if (!cmd) return undefined;
  for (const { name, re } of DANGEROUS_PATTERNS) {
    if (re.test(cmd)) {
      return {
        block: true,
        reason: `Dangerous command pattern detected: ${name}. Require explicit user approval.`,
      };
    }
  }
  return undefined;
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", (event: ToolCallEvent) => {
    const result = check(event.toolName, event.input);
    if (result) return result;
  });
}
