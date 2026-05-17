/**
 * Pure reducer: (state, action, params) -> { state, op }.
 * Performs validation; never mutates inputs; never touches the store.
 */

import { detectCycle, isTransitionValid } from "./invariants.ts";
import type { TaskState } from "./store.ts";
import type { Task, TaskAction, TodoParams } from "./types.ts";

export type Op =
	| { kind: "create"; task: Task }
	| { kind: "update"; before: Task; after: Task }
	| { kind: "delete"; task: Task }
	| { kind: "list"; tasks: Task[] }
	| { kind: "get"; task: Task }
	| { kind: "clear" }
	| { kind: "error"; action: TaskAction; message: string };

export interface ReducerResult {
	state: TaskState;
	op: Op;
}

function nowIso(): string {
	return new Date().toISOString();
}

function err(action: TaskAction, message: string, state: TaskState): ReducerResult {
	return { state, op: { kind: "error", action, message } };
}

function findTask(state: TaskState, id: number): Task | undefined {
	return state.tasks.find((t) => t.id === id);
}

function uniqueIds(ids: number[]): number[] {
	return Array.from(new Set(ids));
}

function applyMetadataPatch(
	current: Record<string, unknown>,
	patch: Record<string, unknown>,
): Record<string, unknown> {
	const next: Record<string, unknown> = { ...current };
	for (const [k, v] of Object.entries(patch)) {
		if (v === null) delete next[k];
		else next[k] = v;
	}
	return next;
}

function validateBlockerIds(state: TaskState, ids: number[], selfId?: number): string | undefined {
	for (const id of ids) {
		if (selfId !== undefined && id === selfId) return `Task #${id} cannot block itself.`;
		const dep = findTask(state, id);
		if (!dep) return `Blocker task #${id} does not exist.`;
		if (dep.status === "deleted") return `Blocker task #${id} is deleted.`;
	}
	return undefined;
}

function reduceCreate(state: TaskState, params: TodoParams): ReducerResult {
	const subject = params.subject?.trim();
	if (!subject) return err("create", "subject is required for create.", state);

	const blockedByInput = uniqueIds(params.blockedBy ?? []);
	const blockerError = validateBlockerIds(state, blockedByInput);
	if (blockerError) return err("create", blockerError, state);

	const ts = nowIso();
	const task: Task = {
		id: state.nextId,
		subject,
		status: "pending",
		createdAt: ts,
		updatedAt: ts,
		blockedBy: blockedByInput,
		metadata: params.metadata ? applyMetadataPatch({}, params.metadata) : {},
	};
	if (params.description !== undefined) task.description = params.description;
	if (params.activeForm !== undefined) task.activeForm = params.activeForm;
	if (params.owner !== undefined) task.owner = params.owner;

	const nextState: TaskState = {
		tasks: [...state.tasks, task],
		nextId: state.nextId + 1,
	};
	return { state: nextState, op: { kind: "create", task } };
}

const MUTABLE_UPDATE_FIELDS = [
	"subject",
	"description",
	"activeForm",
	"status",
	"owner",
	"metadata",
	"addBlockedBy",
	"removeBlockedBy",
] as const;

function reduceUpdate(state: TaskState, params: TodoParams): ReducerResult {
	if (params.id === undefined) return err("update", "id is required for update.", state);
	const before = findTask(state, params.id);
	if (!before) return err("update", `Task #${params.id} does not exist.`, state);

	const hasMutation = MUTABLE_UPDATE_FIELDS.some((k) => params[k] !== undefined);
	if (!hasMutation) {
		return err("update", "update requires at least one mutable field.", state);
	}

	if (params.status !== undefined && !isTransitionValid(before.status, params.status)) {
		return err(
			"update",
			`Invalid status transition for task #${before.id}: ${before.status} -> ${params.status}.`,
			state,
		);
	}

	const adds = uniqueIds(params.addBlockedBy ?? []);
	if (adds.length > 0) {
		const blockerError = validateBlockerIds(state, adds, before.id);
		if (blockerError) return err("update", blockerError, state);
		if (detectCycle(state.tasks, before.id, adds)) {
			return err("update", `Adding blockers would create a cycle in task #${before.id}.`, state);
		}
	}

	const removes = new Set(params.removeBlockedBy ?? []);
	const mergedBlockers = uniqueIds([
		...before.blockedBy.filter((b) => !removes.has(b)),
		...adds,
	]);

	const after: Task = {
		...before,
		blockedBy: mergedBlockers,
		updatedAt: nowIso(),
	};
	if (params.subject !== undefined) after.subject = params.subject;
	if (params.description !== undefined) after.description = params.description;
	if (params.activeForm !== undefined) after.activeForm = params.activeForm;
	if (params.owner !== undefined) after.owner = params.owner;
	if (params.status !== undefined) after.status = params.status;
	if (params.metadata !== undefined) {
		after.metadata = applyMetadataPatch(before.metadata, params.metadata);
	}

	const nextState: TaskState = {
		tasks: state.tasks.map((t) => (t.id === after.id ? after : t)),
		nextId: state.nextId,
	};
	return { state: nextState, op: { kind: "update", before, after } };
}

function reduceDelete(state: TaskState, params: TodoParams): ReducerResult {
	if (params.id === undefined) return err("delete", "id is required for delete.", state);
	const task = findTask(state, params.id);
	if (!task) return err("delete", `Task #${params.id} does not exist.`, state);
	if (task.status === "deleted") return err("delete", `Task #${task.id} is already deleted.`, state);

	const tombstoned: Task = { ...task, status: "deleted", updatedAt: nowIso() };
	const nextState: TaskState = {
		tasks: state.tasks.map((t) => (t.id === task.id ? tombstoned : t)),
		nextId: state.nextId,
	};
	return { state: nextState, op: { kind: "delete", task: tombstoned } };
}

function reduceList(state: TaskState, params: TodoParams): ReducerResult {
	const includeDeleted = params.includeDeleted ?? false;
	let visible = includeDeleted ? state.tasks : state.tasks.filter((t) => t.status !== "deleted");
	if (params.status !== undefined) visible = visible.filter((t) => t.status === params.status);
	return { state, op: { kind: "list", tasks: visible } };
}

function reduceGet(state: TaskState, params: TodoParams): ReducerResult {
	if (params.id === undefined) return err("get", "id is required for get.", state);
	const task = findTask(state, params.id);
	if (!task) return err("get", `Task #${params.id} does not exist.`, state);
	return { state, op: { kind: "get", task } };
}

function reduceClear(state: TaskState): ReducerResult {
	const nextState: TaskState = { tasks: [], nextId: 1 };
	return { state: nextState, op: { kind: "clear" } };
}

export function applyTaskMutation(state: TaskState, action: TaskAction, params: TodoParams): ReducerResult {
	switch (action) {
		case "create": return reduceCreate(state, params);
		case "update": return reduceUpdate(state, params);
		case "delete": return reduceDelete(state, params);
		case "list": return reduceList(state, params);
		case "get": return reduceGet(state, params);
		case "clear": return reduceClear(state);
	}
}
