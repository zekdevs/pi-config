import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	createReadTool,
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	truncateHead,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { formatHashlineBlock, splitLines } from "./hashline.ts";

const BINARY_EXTS = new Set([
	".png",
	".jpg",
	".jpeg",
	".gif",
	".webp",
	".bmp",
	".ico",
	".pdf",
]);

const ReadParams = Type.Object({
	path: Type.String(),
	offset: Type.Optional(Type.Number()),
	limit: Type.Optional(Type.Number()),
});

const DESCRIPTION =
	"Read a file with hashline anchors. Each line is prefixed `LINE#HH:` where LINE is the 1-indexed line number and HH is a 2-character content hash. Use the LINE#HH anchors when calling `edit` so stale edits fail loudly. Images and PDFs are returned as native attachments.";

const GUIDELINES = [
	"`read` returns each line prefixed with `LINE#HH:` (line number + content hash). Use those exact anchors as `pos`/`end` when calling `edit`.",
	"Re-`read` after any external file change before issuing more edits — anchors invalidate on every line modification.",
];

function resolveAbs(cwd: string, p: string): string {
	return path.isAbsolute(p) ? p : path.resolve(cwd, p);
}

function isBinary(absPath: string): boolean {
	return BINARY_EXTS.has(path.extname(absPath).toLowerCase());
}

export function registerReadTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "read",
		label: "read",
		description: DESCRIPTION,
		promptSnippet:
			"read(path, offset?, limit?): returns hashline-prefixed file contents (`LINE#HH:` per line) for use as `edit` anchors.",
		promptGuidelines: GUIDELINES,
		parameters: ReadParams,
		async execute(toolCallId, params, signal, onUpdate, ctx: ExtensionContext) {
			const abs = resolveAbs(ctx.cwd, params.path);

			if (isBinary(abs)) {
				const fallback = createReadTool(ctx.cwd);
				return fallback.execute(toolCallId, params, signal, onUpdate);
			}

			const buf = await fs.readFile(abs);
			const text = buf.toString("utf8");
			const allLines = splitLines(text);

			const offset = Math.max(1, Math.floor(params.offset ?? 1));
			const startIdx = Math.min(offset - 1, allLines.length);
			const limit =
				params.limit !== undefined && params.limit > 0
					? Math.floor(params.limit)
					: allLines.length - startIdx;
			const slice = allLines.slice(startIdx, startIdx + limit);

			const raw = slice.join("\n");
			const truncation = truncateHead(raw, {
				maxBytes: DEFAULT_MAX_BYTES,
				maxLines: DEFAULT_MAX_LINES,
			});
			const visibleLines = splitLines(truncation.content);
			let body = formatHashlineBlock(visibleLines, startIdx + 1);
			if (truncation.truncated) {
				const omittedLines = truncation.totalLines - truncation.outputLines;
				body += `\n... [hashline: ${omittedLines} more lines truncated by ${truncation.truncatedBy}] ...`;
			}

			return {
				content: [{ type: "text", text: body }],
				details: { truncation },
			};
		},
	});
}
