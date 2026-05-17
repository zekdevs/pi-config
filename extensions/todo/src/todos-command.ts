/**
 * Registers the `/todos` slash command. Prints visible tasks grouped by status.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { formatCommandTaskLine, formatStatusLabel } from "./format.ts";
import { getState, selectTasksByStatus, selectTodoCounts } from "./store.ts";
import type { TaskStatus } from "./types.ts";
import { COMMAND_NAME } from "./types.ts";

const DISPLAY_GROUPS: TaskStatus[] = ["pending", "in_progress", "completed"];

function renderGroups(): string {
	const state = getState();
	const counts = selectTodoCounts(state);
	const lines: string[] = [];
	for (const status of DISPLAY_GROUPS) {
		const tasks = selectTasksByStatus(state, status);
		lines.push(`${formatStatusLabel(status)} (${counts[status]})`);
		if (tasks.length === 0) {
			lines.push("  (none)");
		} else {
			for (const t of tasks) lines.push(`  ${formatCommandTaskLine(t)}`);
		}
		lines.push("");
	}
	return lines.join("\n").trimEnd();
}

export function registerTodosCommand(pi: ExtensionAPI): void {
	pi.registerCommand(COMMAND_NAME, {
		description: "Show the current todo list grouped by status.",
		async handler(_args, ctx) {
			if (!ctx.hasUI) {
				return;
			}
			const state = getState();
			const visibleCount = state.tasks.filter((t) => t.status !== "deleted").length;
			if (visibleCount === 0) {
				ctx.ui.notify("No todos yet. Ask the agent to add some!", "info");
				return;
			}
			ctx.ui.notify(renderGroups(), "info");
		},
	});
}
