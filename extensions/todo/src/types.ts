/**
 * Schema, constants, and shared types for the todo extension.
 */

import { Type, type Static } from "@sinclair/typebox";

export const TOOL_NAME = "todo";
export const COMMAND_NAME = "todos";

export const TASK_STATUSES = ["pending", "in_progress", "completed", "deleted"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_ACTIONS = ["create", "update", "list", "get", "delete", "clear"] as const;
export type TaskAction = (typeof TASK_ACTIONS)[number];

export interface Task {
	id: number;
	subject: string;
	status: TaskStatus;
	createdAt: string;
	updatedAt: string;
	description?: string;
	activeForm?: string;
	owner?: string;
	blockedBy: number[];
	metadata: Record<string, unknown>;
}

export interface TaskDetails {
	action: TaskAction;
	params: TodoParams;
	tasks: Task[];
	nextId: number;
	error?: string;
}

export const TodoParamsSchema = Type.Object({
	action: Type.Union(TASK_ACTIONS.map((a) => Type.Literal(a)), {
		description: "Operation to perform on the todo list.",
	}),
	subject: Type.Optional(
		Type.String({ description: "Short imperative title (required for create)." }),
	),
	description: Type.Optional(
		Type.String({ description: "Long-form description / acceptance criteria." }),
	),
	activeForm: Type.Optional(
		Type.String({ description: "Present-continuous label shown while in_progress (e.g. 'researching X')." }),
	),
	status: Type.Optional(
		Type.Union(TASK_STATUSES.map((s) => Type.Literal(s)), {
			description: "Target status for update; filter for list.",
		}),
	),
	blockedBy: Type.Optional(
		Type.Array(Type.Number(), { description: "Initial blocker ids (create only)." }),
	),
	addBlockedBy: Type.Optional(
		Type.Array(Type.Number(), { description: "Blocker ids to add on update." }),
	),
	removeBlockedBy: Type.Optional(
		Type.Array(Type.Number(), { description: "Blocker ids to remove on update." }),
	),
	owner: Type.Optional(
		Type.String({
			description:
				"Subagent / role assigned to execute (e.g. 'Developer', 'Test', 'Security', 'Architect'). The orchestrator uses this to dispatch work and track which subagent owns the task.",
		}),
	),
	metadata: Type.Optional(
		Type.Record(Type.String(), Type.Unknown(), {
			description: "Free-form metadata. On update, pass null per key to delete that key.",
		}),
	),
	id: Type.Optional(Type.Number({ description: "Task id (required for update / get / delete)." })),
	includeDeleted: Type.Optional(
		Type.Boolean({ description: "Include deleted (tombstoned) tasks in list output. Defaults to false." }),
	),
});

export type TodoParams = Static<typeof TodoParamsSchema>;

export interface TaskMutationParams extends TodoParams {}
