import { promises as fs } from "node:fs";
import * as path from "node:path";
import { computeLineHash, formatAnchorContext, HASHLINE_PREFIX_RE } from "./hashline.ts";

export type EditOp = "replace" | "append" | "prepend" | "replace_text";

export interface EditSpec {
	op: EditOp;
	pos?: string;
	end?: string;
	lines?: string | string[] | null;
	oldText?: string;
	newText?: string;
}

const ANCHOR_RE = /^(\d+)(?:#([A-Za-z]{2}))?$/;

interface ParsedAnchor {
	line: number;
	hash: string | undefined;
}

function parseAnchor(raw: string | undefined, field: string): ParsedAnchor {
	if (raw === undefined || raw === null || String(raw).trim() === "") {
		throw new Error(`[E_INVALID_PATCH] missing ${field}`);
	}
	const m = String(raw).trim().match(ANCHOR_RE);
	if (!m) throw new Error(`[E_INVALID_PATCH] invalid ${field} anchor: ${raw}`);
	const line = parseInt(m[1], 10);
	if (!Number.isFinite(line) || line < 1) {
		throw new Error(`[E_INVALID_PATCH] non-positive line in ${field}: ${raw}`);
	}
	return { line, hash: m[2]?.toUpperCase() };
}

function normalizeLines(value: string | string[] | null | undefined): string[] {
	if (value === null || value === undefined) return [];
	const arr = typeof value === "string" ? value.split("\n") : value;
	for (const line of arr) {
		if (typeof line !== "string") {
			throw new Error("[E_INVALID_PATCH] lines must be string or string[]");
		}
		if (HASHLINE_PREFIX_RE.test(line)) {
			throw new Error(
				"[E_INVALID_PATCH] lines must be raw content; remove the LINE#HH: display prefix",
			);
		}
	}
	return arr;
}

function verifyAnchor(snapshot: string[], anchor: ParsedAnchor, field: string): void {
	if (anchor.line > snapshot.length) {
		throw new Error(
			`[E_STALE_ANCHOR] ${field} line ${anchor.line} is past EOF (file has ${snapshot.length} lines)`,
		);
	}
	if (!anchor.hash) return;
	const actual = computeLineHash(snapshot[anchor.line - 1], anchor.line);
	if (actual !== anchor.hash) {
		const ctx = formatAnchorContext(snapshot, anchor.line);
		throw new Error(
			`[E_STALE_ANCHOR] ${field} hash mismatch at line ${anchor.line}: expected #${anchor.hash}, got #${actual}\nFresh anchors:\n${ctx}`,
		);
	}
}

interface PreparedEdit {
	op: EditOp;
	startIdx: number;
	endIdx: number;
	insert: string[];
}

function prepareEdit(snapshot: string[], spec: EditSpec): PreparedEdit {
	switch (spec.op) {
		case "replace": {
			const startA = parseAnchor(spec.pos, "pos");
			verifyAnchor(snapshot, startA, "pos");
			let endLine = startA.line;
			if (spec.end !== undefined && spec.end !== null && String(spec.end).trim() !== "") {
				const endA = parseAnchor(spec.end, "end");
				verifyAnchor(snapshot, endA, "end");
				if (endA.line < startA.line) {
					throw new Error(
						`[E_INVALID_PATCH] end line ${endA.line} precedes pos line ${startA.line}`,
					);
				}
				endLine = endA.line;
			}
			return {
				op: "replace",
				startIdx: startA.line - 1,
				endIdx: endLine,
				insert: normalizeLines(spec.lines),
			};
		}
		case "append": {
			let idx = snapshot.length;
			if (spec.pos !== undefined && spec.pos !== null && String(spec.pos).trim() !== "") {
				const a = parseAnchor(spec.pos, "pos");
				verifyAnchor(snapshot, a, "pos");
				idx = a.line;
			}
			return { op: "append", startIdx: idx, endIdx: idx, insert: normalizeLines(spec.lines) };
		}
		case "prepend": {
			let idx = 0;
			if (spec.pos !== undefined && spec.pos !== null && String(spec.pos).trim() !== "") {
				const a = parseAnchor(spec.pos, "pos");
				verifyAnchor(snapshot, a, "pos");
				idx = a.line - 1;
			}
			return { op: "prepend", startIdx: idx, endIdx: idx, insert: normalizeLines(spec.lines) };
		}
		case "replace_text": {
			if (typeof spec.oldText !== "string" || spec.oldText.length === 0) {
				throw new Error("[E_INVALID_PATCH] replace_text requires non-empty oldText");
			}
			if (typeof spec.newText !== "string") {
				throw new Error("[E_INVALID_PATCH] replace_text requires newText (string)");
			}
			return { op: "replace_text", startIdx: -1, endIdx: -1, insert: [] };
		}
		default:
			throw new Error(`[E_INVALID_PATCH] unknown op: ${(spec as EditSpec).op}`);
	}
}

function applyTextReplacement(snapshot: string[], spec: EditSpec): string[] {
	const original = snapshot.join("\n");
	const oldText = spec.oldText as string;
	const newText = spec.newText as string;
	const first = original.indexOf(oldText);
	if (first < 0) {
		throw new Error(`[E_STALE_ANCHOR] replace_text: oldText not found`);
	}
	const second = original.indexOf(oldText, first + 1);
	if (second >= 0) {
		throw new Error(
			`[E_INVALID_PATCH] replace_text: oldText matches multiple locations (at offsets ${first}, ${second}); make it unique`,
		);
	}
	const updated = original.slice(0, first) + newText + original.slice(first + oldText.length);
	return updated.split("\n");
}

export interface ApplyResult {
	before: string[];
	after: string[];
	firstChangedLine: number | undefined;
}

export function applyHashlineEdits(snapshot: string[], specs: EditSpec[]): ApplyResult {
	const indexed = specs.map((spec, idx) => ({ spec, prepared: prepareEdit(snapshot, spec), idx }));

	const linePatches = indexed.filter((e) => e.prepared.op !== "replace_text");
	const textPatches = indexed.filter((e) => e.prepared.op === "replace_text");

	linePatches.sort((a, b) => {
		if (b.prepared.startIdx !== a.prepared.startIdx) {
			return b.prepared.startIdx - a.prepared.startIdx;
		}
		return b.idx - a.idx;
	});

	let working = snapshot.slice();
	let firstChangedLine: number | undefined;
	const recordChange = (lineNum: number) => {
		if (firstChangedLine === undefined || lineNum < firstChangedLine) {
			firstChangedLine = lineNum;
		}
	};

	for (const { prepared } of linePatches) {
		const removed = working.slice(prepared.startIdx, prepared.endIdx);
		const same =
			removed.length === prepared.insert.length &&
			removed.every((l, i) => l === prepared.insert[i]);
		working.splice(prepared.startIdx, prepared.endIdx - prepared.startIdx, ...prepared.insert);
		if (!same) recordChange(prepared.startIdx + 1);
	}

	for (const { spec } of textPatches) {
		const before = working.join("\n");
		working = applyTextReplacement(working, spec);
		const after = working.join("\n");
		if (after !== before) {
			let diffLine = 1;
			const len = Math.min(before.length, after.length);
			for (let i = 0; i < len; i++) {
				if (before[i] !== after[i]) {
					diffLine = before.slice(0, i).split("\n").length;
					break;
				}
			}
			recordChange(diffLine);
		}
	}

	return { before: snapshot, after: working, firstChangedLine };
}

export function buildUnifiedDiff(
	relPath: string,
	before: string[],
	after: string[],
): string {
	const header = `--- ${relPath}\n+++ ${relPath}`;
	const max = Math.max(before.length, after.length);
	const hunks: string[] = [];
	let i = 0;
	while (i < max) {
		const b = i < before.length ? before[i] : undefined;
		const a = i < after.length ? after[i] : undefined;
		if (b === a) {
			i++;
			continue;
		}
		let j = i;
		while (j < max) {
			const bb = j < before.length ? before[j] : undefined;
			const aa = j < after.length ? after[j] : undefined;
			if (bb === aa) break;
			j++;
		}
		const removed = before.slice(i, Math.min(j, before.length));
		const added = after.slice(i, Math.min(j, after.length));
		hunks.push(`@@ -${i + 1},${removed.length} +${i + 1},${added.length} @@`);
		for (const r of removed) hunks.push(`-${r}`);
		for (const a2 of added) hunks.push(`+${a2}`);
		i = j;
	}
	if (hunks.length === 0) return "";
	return `${header}\n${hunks.join("\n")}`;
}

export async function atomicWrite(absPath: string, content: string): Promise<void> {
	const realPath = await fs.realpath(absPath).catch(() => absPath);
	let mode = 0o644;
	try {
		const st = await fs.stat(realPath);
		mode = st.mode & 0o777;
	} catch {}
	const dir = path.dirname(realPath);
	const base = path.basename(realPath);
	const tmp = path.join(dir, `.${base}.${process.pid}.${Date.now()}.tmp`);
	await fs.writeFile(tmp, content, { mode });
	try {
		await fs.rename(tmp, realPath);
	} catch (err) {
		await fs.unlink(tmp).catch(() => {});
		throw err;
	}
}
