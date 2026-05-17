/**
 * Formatters and the tool result envelope builder.
 */

import type { Op } from "./reducer.ts";
import { selectTodoCounts, type TaskState } from "./store.ts";
import type { Task, TaskDetails, TaskStatus, TodoParams } from "./types.ts";

const STATUS_GLYPH: Record<TaskStatus, string> = {
	pending: "○",
	in_progress: "◐",
	completed: "✓",
	deleted: "✗",
};

export function formatStatusLabel(status: TaskStatus): string {
	switch (status) {
		case "pending": return "Pending";
		case "in_progress": return "In Progress";
		case "completed": return "Completed";
		case "deleted": return "Deleted";
	}
}

function ownerTag(task: Task): string {
	return task.owner ? ` [${task.owner}]` : "";
}

export function formatCommandTaskLine(task: Task): string {
	return `${STATUS_GLYPH[task.status]} #${task.id}${ownerTag(task)} ${task.subject}`;
}

export function renderTodoCall(params: TodoParams): string {
	const parts: string[] = [`action=${params.action}`];
	if (params.id !== undefined) parts.push(`id=${params.id}`);
	if (params.subject) parts.push(`subject="${params.subject}"`);
	if (params.status) parts.push(`status=${params.status}`);
	if (params.owner) parts.push(`owner=${params.owner}`);
	return `todo ${parts.join(" ")}`;
}

function summarizeOp(op: Op): string {
	switch (op.kind) {
		case "create": return `Created task #${op.task.id}: ${op.task.subject}${ownerTag(op.task)}`;
		case "update": {
			const changes: string[] = [];
			if (op.before.status !== op.after.status) changes.push(`status: ${op.before.status} -> ${op.after.status}`);
			if (op.before.subject !== op.after.subject) changes.push("subject");
			if (op.before.owner !== op.after.owner) changes.push(`owner: ${op.before.owner ?? "-"} -> ${op.after.owner ?? "-"}`);
			if (op.before.description !== op.after.description) changes.push("description");
			if (op.before.activeForm !== op.after.activeForm) changes.push("activeForm");
			const detail = changes.length > 0 ? ` (${changes.join("; ")})` : "";
			return `Updated task #${op.after.id}${detail}`;
		}
		case "delete": return `Deleted task #${op.task.id}: ${op.task.subject}`;
		case "get": return `Task #${op.task.id} [${op.task.status}]${ownerTag(op.task)} ${op.task.subject}`;
		case "list": {
			if (op.tasks.length === 0) return "No tasks match.";
			return op.tasks.map(formatCommandTaskLine).join("\n");
		}
		case "clear": return "Cleared all tasks.";
		case "error": return `Error (${op.action}): ${op.message}`;
	}
}

export function renderTodoResult(state: TaskState, op: Op): string {
	const counts = selectTodoCounts(state);
	const header = summarizeOp(op);
	if (op.kind === "list" || op.kind === "error" || op.kind === "get") return header;
	const tally = `pending=${counts.pending} in_progress=${counts.in_progress} completed=${counts.completed}`;
	return `${header}\n${tally}`;
}

export interface ToolResultEnvelope {
	content: { type: "text"; text: string }[];
	details: TaskDetails;
	isError?: boolean;
}

export function buildToolResult(
	action: TodoParams["action"],
	params: TodoParams,
	state: TaskState,
	op: Op,
): ToolResultEnvelope {
	const text = renderTodoResult(state, op);
	const details: TaskDetails = {
		action,
		params,
		tasks: state.tasks,
		nextId: state.nextId,
	};
	if (op.kind === "error") {
		details.error = op.message;
		return {
			content: [{ type: "text", text }],
			details,
			isError: true,
		};
	}
	return {
		content: [{ type: "text", text }],
		details,
	};
}
