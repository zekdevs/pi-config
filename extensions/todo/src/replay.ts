/**
 * Reconstructs TaskState from the current branch by replaying the most recent todo tool result.
 * Pure: callers commit the returned state to the store.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { EMPTY_STATE, type TaskState } from "./store.ts";
import { TOOL_NAME, type Task, type TaskDetails } from "./types.ts";

function looksLikeTaskDetails(details: unknown): details is TaskDetails {
	if (!details || typeof details !== "object") return false;
	const d = details as { tasks?: unknown; nextId?: unknown };
	return Array.isArray(d.tasks) && typeof d.nextId === "number";
}

export function replayFromBranch(ctx: ExtensionContext): TaskState {
	const sessionManager = ctx.sessionManager;
	if (!sessionManager) return EMPTY_STATE;
	const branch = sessionManager.getBranch();
	for (let i = branch.length - 1; i >= 0; i--) {
		const entry = branch[i];
		if (entry.type !== "message") continue;
		const message = entry.message as { role?: string; toolName?: string; details?: unknown };
		if (message.role !== "toolResult") continue;
		if (message.toolName !== TOOL_NAME) continue;
		if (!looksLikeTaskDetails(message.details)) continue;
		const tasks = message.details.tasks.map((t) => ({ ...t })) as Task[];
		return { tasks, nextId: message.details.nextId };
	}
	return EMPTY_STATE;
}
