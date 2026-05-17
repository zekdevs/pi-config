import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	applyHashlineEdits,
	atomicWrite,
	buildUnifiedDiff,
	type EditSpec,
} from "./apply.ts";
import { formatHashlineBlock, splitLines } from "./hashline.ts";

const EditEntry = Type.Object({
	op: Type.Union([
		Type.Literal("replace"),
		Type.Literal("append"),
		Type.Literal("prepend"),
		Type.Literal("replace_text"),
	]),
	pos: Type.Optional(Type.String()),
	end: Type.Optional(Type.String()),
	lines: Type.Optional(
		Type.Union([Type.String(), Type.Array(Type.String()), Type.Null()]),
	),
	oldText: Type.Optional(Type.String()),
	newText: Type.Optional(Type.String()),
});

const ReturnRange = Type.Object({
	start: Type.Number(),
	end: Type.Optional(Type.Number()),
});

const EditParams = Type.Object({
	path: Type.String(),
	edits: Type.Array(EditEntry),
	returnMode: Type.Optional(
		Type.Union([Type.Literal("changed"), Type.Literal("full"), Type.Literal("ranges")]),
	),
	returnRanges: Type.Optional(Type.Array(ReturnRange)),
});

const DESCRIPTION = [
	"Apply structured edits to a file using LINE#HH hashline anchors from `read`.",
	"Operations:",
	"  • replace        — replace single line at `pos`, or inclusive range `pos`..`end`.",
	"  • append         — insert AFTER `pos` (or at EOF when `pos` is omitted).",
	"  • prepend        — insert BEFORE `pos` (or at BOF when `pos` is omitted).",
	"  • replace_text   — substitute exact `oldText` with `newText` (must match exactly once).",
	"All edits are validated against the same pre-edit snapshot and applied bottom-up; do NOT renumber.",
	"`pos` / `end` anchors take the form `LINE` or `LINE#HH` (the hash from `read`); a stale hash raises [E_STALE_ANCHOR] with fresh anchors.",
	"`lines` accepts a string (split on \\n), a string[], or null (empty). It must contain RAW content — never include the `LINE#HH:` display prefix.",
	"`returnMode`: 'changed' (default) returns hashline anchors for the modified region only; 'full' returns the whole file with anchors; 'ranges' returns regions named in `returnRanges`.",
].join("\n");

const GUIDELINES = [
	"Always `read` (or re-`read`) the file before calling `edit` to pick up fresh `LINE#HH` anchors.",
	"Pass anchors verbatim as `pos`/`end`. Strip the `LINE#HH:` prefix from any content you put in `lines`.",
	"Bundle related edits in one call; they are validated against the same snapshot and applied bottom-up.",
];

function resolveAbs(cwd: string, p: string): string {
	return path.isAbsolute(p) ? p : path.resolve(cwd, p);
}

function buildReturnText(
	mode: "changed" | "full" | "ranges",
	after: string[],
	firstChangedLine: number | undefined,
	ranges: Array<{ start: number; end?: number }> | undefined,
): string {
	if (mode === "full") {
		return formatHashlineBlock(after, 1);
	}
	if (mode === "ranges" && ranges && ranges.length > 0) {
		const blocks: string[] = [];
		for (const r of ranges) {
			const start = Math.max(1, Math.floor(r.start));
			const end = Math.min(after.length, Math.floor(r.end ?? r.start));
			if (start > end || start > after.length) continue;
			blocks.push(formatHashlineBlock(after.slice(start - 1, end), start));
		}
		return blocks.join("\n---\n");
	}
	if (firstChangedLine === undefined) return "(no changes)";
	const start = Math.max(1, firstChangedLine - 2);
	const end = Math.min(after.length, firstChangedLine + 6);
	return formatHashlineBlock(after.slice(start - 1, end), start);
}

export function registerEditTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "edit",
		label: "edit",
		description: DESCRIPTION,
		promptSnippet:
			"edit(path, edits[]): apply replace/append/prepend/replace_text edits using `LINE#HH` hashline anchors from `read`.",
		promptGuidelines: GUIDELINES,
		parameters: EditParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx: ExtensionContext) {
			const abs = resolveAbs(ctx.cwd, params.path);
			const realAbs = await fs.realpath(abs).catch(() => abs);

			return withFileMutationQueue(realAbs, async () => {
				const buf = await fs.readFile(realAbs);
				const original = buf.toString("utf8");
				const snapshot = splitLines(original);
				const trailingNewline = original.endsWith("\n") || original.length === 0;

				const result = applyHashlineEdits(snapshot, params.edits as EditSpec[]);
				const updatedText = result.after.join("\n") + (trailingNewline ? "\n" : "");

				if (updatedText !== original) {
					await atomicWrite(realAbs, updatedText);
				}

				const relPath = path.relative(ctx.cwd, realAbs) || params.path;
				const diff = buildUnifiedDiff(relPath, snapshot, result.after);
				const body = buildReturnText(
					params.returnMode ?? "changed",
					result.after,
					result.firstChangedLine,
					params.returnRanges,
				);

				const text =
					updatedText === original
						? `No changes applied to ${relPath}.\n${body}`
						: `Edited ${relPath} (${result.after.length} lines).\n${body}`;

				return {
					content: [{ type: "text", text }],
					details: {
						diff,
						firstChangedLine: result.firstChangedLine,
					},
				};
			});
		},
	});
}
