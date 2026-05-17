import { xxHash32String } from "./xxhash.ts";

const NIBBLE_STR = "ZPMQVRWSNKTXJBYH";
const ALNUM_RE = /[\p{L}\p{N}]/u;

export const HASHLINE_PREFIX_RE = /^\s*\d+#[A-Z]{2}:/;

export function computeLineHash(line: string, lineNumber: number): string {
	const normalized = line.trimEnd().replace(/\r/g, "");
	const seed = ALNUM_RE.test(normalized) ? 0 : lineNumber;
	const h = xxHash32String(normalized, seed) & 0xff;
	return NIBBLE_STR[(h >>> 4) & 0xf] + NIBBLE_STR[h & 0xf];
}

export function splitLines(text: string): string[] {
	if (text.length === 0) return [];
	const out = text.split("\n");
	if (out.length > 0 && out[out.length - 1] === "") out.pop();
	return out;
}

export function formatHashlineBlock(lines: string[], startLine: number): string {
	if (lines.length === 0) return "";
	const lastLineNum = startLine + lines.length - 1;
	const width = String(lastLineNum).length;
	const out: string[] = [];
	for (let i = 0; i < lines.length; i++) {
		const lineNum = startLine + i;
		const hash = computeLineHash(lines[i], lineNum);
		const padded = String(lineNum).padStart(width, " ");
		out.push(`${padded}#${hash}:${lines[i]}`);
	}
	return out.join("\n");
}

export function formatAnchorContext(
	lines: string[],
	targetLine: number,
	radius = 3,
): string {
	const start = Math.max(1, targetLine - radius);
	const end = Math.min(lines.length, targetLine + radius);
	if (start > end) return "";
	const slice = lines.slice(start - 1, end);
	return formatHashlineBlock(slice, start);
}
