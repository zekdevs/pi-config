/**
 * TypeBox schemas for subagent tool parameters
 */

import { Type } from "typebox";
import { SUBAGENT_ACTIONS } from "../shared/types.ts";

const SkillOverride = Type.Unsafe({
	anyOf: [
		{ type: "array", items: { type: "string" } },
		{ type: "boolean" },
		{ type: "string" },
	],
	description: "Skill name(s) to inject (comma-separated), array of strings, or boolean (false disables, true uses default)",
});

const OutputOverride = Type.Unsafe({
	anyOf: [
		{ type: "string" },
		{ type: "boolean" },
	],
	description: "Output filename/path (string), or false to disable file output",
});

const OutputModeOverride = Type.String({
	enum: ["inline", "file-only"],
	description: "Return saved output inline (default) or only a concise file reference. file-only requires output to be a path.",
});

const ReadsOverride = Type.Unsafe({
	anyOf: [
		{ type: "array", items: { type: "string" } },
		{ type: "boolean" },
	],
	description: "Files to read before running (array of filenames), or false to disable",
});

const TaskItem = Type.Object({
	agent: Type.String(),
	task: Type.String(),
	cwd: Type.Optional(Type.String()),
	count: Type.Optional(Type.Integer({ minimum: 1, description: "Repeat this parallel task N times with the same settings." })),
	output: Type.Optional(OutputOverride),
	outputMode: Type.Optional(OutputModeOverride),
	reads: Type.Optional(ReadsOverride),
	progress: Type.Optional(Type.Boolean({ description: "Enable progress.md tracking for this task" })),
	model: Type.Optional(Type.String({ description: "Override model for this task (e.g. 'google/gemini-3-pro')" })),
	skill: Type.Optional(SkillOverride),
});

const ControlOverrides = Type.Object({
	enabled: Type.Optional(Type.Boolean({ description: "Enable/disable subagent control attention tracking for this run" })),
	needsAttentionAfterMs: Type.Optional(Type.Integer({ minimum: 1, description: "No-observed-activity window before a run needs attention" })),
	activeNoticeAfterMs: Type.Optional(Type.Integer({ minimum: 1, description: "Active-long-running notice threshold by elapsed ms (default: 240000)" })),
	activeNoticeAfterTurns: Type.Optional(Type.Integer({ minimum: 1, description: "Optional active-long-running notice threshold by assistant turns (disabled by default)" })),
	activeNoticeAfterTokens: Type.Optional(Type.Integer({ minimum: 1, description: "Optional active-long-running notice threshold by total tokens (disabled by default)" })),
	failedToolAttemptsBeforeAttention: Type.Optional(Type.Integer({ minimum: 1, description: "Consecutive mutating-tool failures before escalating to needs_attention (default: 3)" })),
	notifyOn: Type.Optional(Type.Array(Type.String({ enum: ["active_long_running", "needs_attention"] }), {
		description: "Control event types that should notify the parent/orchestrator. Defaults to active_long_running and needs_attention.",
	})),
	notifyChannels: Type.Optional(Type.Array(Type.String({ enum: ["event", "async", "intercom"] }), {
		description: "Notification channels to use when available. Defaults to event, async, and intercom.",
	})),
});

export const SubagentParams = Type.Object({
	agent: Type.Optional(Type.String({ description: "Agent name (SINGLE mode) or target for management get/update/delete" })),
	task: Type.Optional(Type.String({ description: "Task (SINGLE mode, optional for self-contained agents)" })),
	action: Type.Optional(Type.String({
		enum: [...SUBAGENT_ACTIONS],
		description: "Management/control action. Omit for execution mode."
	})),
	id: Type.Optional(Type.String({
		description: "Run id or prefix for action='status', action='interrupt', or action='resume'."
	})),
	runId: Type.Optional(Type.String({
		description: "Target run ID for action='interrupt' or action='resume'. Defaults to the most recently active controllable run for interrupt. Prefer id for new calls."
	})),
	dir: Type.Optional(Type.String({
		description: "Async run directory for action='status' or action='resume'."
	})),
	index: Type.Optional(Type.Integer({ minimum: 0, description: "Zero-based child index for actions that target a specific child." })),
	message: Type.Optional(Type.String({ description: "Follow-up message for action='resume'. Use index to choose a child from multi-child runs." })),
	config: Type.Optional(Type.Unsafe({
		anyOf: [
			{ type: "object", additionalProperties: true },
			{ type: "string" },
		],
		description: "Agent config for create/update: name, package (optional namespace; runtime name becomes package.name), description, scope ('user'|'project', default 'user'), systemPrompt, systemPromptMode, inheritProjectContext, inheritSkills, defaultContext ('fresh'|'fork'), model, tools (comma-separated), extensions (comma-separated), skills (comma-separated), thinking, output, reads, progress, maxSubagentDepth. String values must be valid JSON."
	})),
	tasks: Type.Optional(Type.Array(TaskItem, { description: "PARALLEL mode: [{agent, task, count?, output?, outputMode?, reads?, progress?}, ...]" })),
	concurrency: Type.Optional(Type.Integer({ minimum: 1, description: "Top-level PARALLEL mode only: max concurrent tasks. Defaults to config.parallel.concurrency or 4." })),
	worktree: Type.Optional(Type.Boolean({
		description: "Create isolated git worktrees for each parallel task. " +
			"Prevents filesystem conflicts. Requires clean git state. " +
			"Per-worktree diffs included in output."
	})),
	context: Type.Optional(Type.String({
		enum: ["fresh", "fork"],
		description: "'fresh' or 'fork' to branch from parent session. If omitted, any requested agent with defaultContext: 'fork' makes the whole invocation forked; otherwise the default is 'fresh'.",
	})),
	async: Type.Optional(Type.Boolean({ description: "Run in background (default: false, or per config)" })),
	agentScope: Type.Optional(Type.String({ description: "Agent discovery scope: 'user', 'project', or 'both' (default: 'both'; project wins on name collisions)" })),
	cwd: Type.Optional(Type.String()),
	artifacts: Type.Optional(Type.Boolean({ description: "Write debug artifacts (default: true)" })),
	includeProgress: Type.Optional(Type.Boolean({ description: "Include full progress in result (default: false)" })),
	share: Type.Optional(Type.Boolean({ description: "Upload session to GitHub Gist for sharing (default: false)" })),
	sessionDir: Type.Optional(
		Type.String({ description: "Directory to store session logs (default: temp; enables sessions even if share=false)" }),
	),
	clarify: Type.Optional(Type.Boolean({ description: "Show TUI to preview/edit before execution (default: false). Implies sync mode." })),
	control: Type.Optional(ControlOverrides),
	output: Type.Optional(Type.Unsafe({
		anyOf: [
			{ type: "string" },
			{ type: "boolean" },
		],
		description: "Output file for single agent (string), or false to disable. Relative paths resolve against cwd.",
	})),
	outputMode: Type.Optional(OutputModeOverride),
	skill: Type.Optional(SkillOverride),
	model: Type.Optional(Type.String({ description: "Override model for single agent (e.g. 'anthropic/claude-sonnet-4')" })),
});
