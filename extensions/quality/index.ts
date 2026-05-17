/*
 * pi quality extension
 *
 * API:
 *   - Module default-exports a function that receives an `ExtensionAPI` instance.
 *   - The `tool_call` handler can return `{ additionalContext: string }` to surface
 *     content to the model after running side-effecting checks (lint).
 */

import type { ExtensionAPI, ToolCallEvent } from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, readFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";

const execFileP = promisify(execFile);

const EDIT_TOOLS = new Set([
  "editFiles",
  "create_file",
  "replace_string_in_file",
  "edit",
  "write_file",
  "str_replace_editor",
]);

const PY_EXT = new Set([".py"]);
const JS_EXT = new Set([".ts", ".tsx", ".js", ".jsx"]);

function extractPath(input: any): string | null {
  if (!input || typeof input !== "object") return null;
  for (const key of ["filePath", "file_path", "path"]) {
    const v = input[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  if (Array.isArray(input.files) && typeof input.files[0] === "string") return input.files[0];
  return null;
}

async function findUp(start: string, name: string): Promise<string | null> {
  let cur = resolve(start);
  while (true) {
    try {
      await access(join(cur, name));
      return join(cur, name);
    } catch { /* keep walking */ }
    const parent = dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}

async function hasEslintConfig(fromDir: string): Promise<boolean> {
  const candidates = [
    ".eslintrc",
    ".eslintrc.js",
    ".eslintrc.cjs",
    ".eslintrc.json",
    ".eslintrc.yml",
    ".eslintrc.yaml",
    "eslint.config.js",
    "eslint.config.mjs",
    "eslint.config.cjs",
  ];
  for (const c of candidates) {
    if (await findUp(fromDir, c)) return true;
  }
  const pkg = await findUp(fromDir, "package.json");
  if (pkg) {
    try {
      const raw = await readFile(pkg, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed.eslintConfig) return true;
    } catch { /* ignore */ }
  }
  return false;
}

async function runRuff(file: string): Promise<string | null> {
  try {
    const { stdout, stderr } = await execFileP("ruff", ["check", "--select", "E,W", file], { timeout: 15_000 });
    const out = (stdout + stderr).trim();
    return out.length ? out : null;
  } catch (err: any) {
    if (err?.code === "ENOENT") return null;
    if (err?.stdout || err?.stderr) {
      const out = String(err.stdout || "") + String(err.stderr || "");
      return out.trim() || null;
    }
    console.warn(`ruff failed: ${err?.message ?? err}`);
    return null;
  }
}

async function runEslint(file: string): Promise<string | null> {
  const dir = dirname(file);
  const pkg = await findUp(dir, "package.json");
  if (!pkg) return null;
  if (!(await hasEslintConfig(dir))) return null;
  try {
    const { stdout, stderr } = await execFileP(
      "npx",
      ["--no-install", "eslint", "--no-error-on-unmatched-pattern", file],
      { timeout: 15_000 },
    );
    const out = (stdout + stderr).trim();
    return out.length ? out : null;
  } catch (err: any) {
    if (err?.code === "ENOENT") return null;
    if (err?.stdout || err?.stderr) {
      const out = String(err.stdout || "") + String(err.stderr || "");
      return out.trim() || null;
    }
    console.warn(`eslint failed: ${err?.message ?? err}`);
    return null;
  }
}

async function lint(filePath: string): Promise<string | null> {
  const ext = extname(filePath).toLowerCase();
  if (PY_EXT.has(ext)) return runRuff(filePath);
  if (JS_EXT.has(ext)) return runEslint(filePath);
  return null;
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event: ToolCallEvent) => {
    if (!EDIT_TOOLS.has(event.toolName)) return undefined;
    const file = extractPath(event.input);
    if (!file) return undefined;
    const issues = await lint(file);
    if (!issues) return undefined;
    return { additionalContext: `Lint issues in ${file}:\n${issues}` };
  });
}
