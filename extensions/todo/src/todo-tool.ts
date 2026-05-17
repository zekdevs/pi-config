/**
 * Registers the `todo` tool. The tool is the persistence boundary:
 * its result `details` is what `replayFromBranch` reads back.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildToolResult } from "./format.ts";
import { applyTaskMutation } from "./reducer.ts";
import { commitState, getState } from "./store.ts";
import { TOOL_NAME, TodoParamsSchema, type TaskDetails, type TodoParams } from "./types.ts";

const PROMPT_GUIDELINES = [
	"Use `todo` for any multi-step work (3+ steps), or immediately after receiving instructions to capture requirements. Skip for trivial single-step tasks.",
	"Mark a task in_progress BEFORE work starts; mark completed IMMEDIATELY when done. Exactly one task in_progress at a time.",
	"Set `owner` to the subagent/role that will execute the task (e.g. 'Developer', 'Test', 'Security', 'Architect'). The orchestrator uses this to dispatch work and track which subagent is responsible.",
	"Never mark completed if tests fail, work is partial, or there are unresolved errors — keep in_progress and create a new task for the blocker.",
	"Use `blockedBy` to express ordering (A is blocked by B). Cycles are rejected. On update, use `addBlockedBy`/`removeBlockedBy` for additive merges.",
	"`subject` is short imperative ('Research X'); `description` is long-form; `activeForm` is present-continuous ('researching X').",
	"`list` hides deleted tasks by default; pass `includeDeleted: true` to see tombstones.",
	"On update, pass `metadata: { key: null }` to delete a metadata key.",
];

export function registerTodoTool(pi: ExtensionAPI): void {
	pi.registerTool<typeof TodoParamsSchema, TaskDetails>({
		name: TOOL_NAME,
		label: "todo",
		description:
			"Track multi-step work and dispatch tasks to subagents. Supports create / update / list / get / delete / clear. The `owner` field assigns a task to a subagent or role; the orchestrator uses it to hand off work.",
		promptSnippet:
			"Track multi-step work as a todo list; assign tasks to subagents via `owner`.",
		promptGuidelines: PROMPT_GUIDELINES,
		parameters: TodoParamsSchema,
		async execute(_toolCallId, params: TodoParams) {
			const before = getState();
			const result = applyTaskMutation(before, params.action, params);
			commitState(result.state);
			return buildToolResult(params.action, params, result.state, result.op);
		},
	});
}
