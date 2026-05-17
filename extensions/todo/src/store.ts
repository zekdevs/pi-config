/**
 * In-memory state cell + selectors. The reducer is pure; callers commit via commitState.
 */

import type { Task, TaskStatus } from "./types.ts";

export interface TaskState {
	tasks: Task[];
	nextId: number;
}

export const EMPTY_STATE: TaskState = Object.freeze({ tasks: [], nextId: 1 }) as TaskState;

let current: TaskState = EMPTY_STATE;

export function getState(): TaskState {
	return current;
}

export function replaceState(next: TaskState): void {
	current = next;
}

export function commitState(next: TaskState): void {
	current = next;
}

export function getTodos(): Task[] {
	return current.tasks;
}

export function __resetState(): void {
	current = EMPTY_STATE;
}

export function selectVisibleTasks(state: TaskState, includeDeleted: boolean): Task[] {
	return includeDeleted ? state.tasks : state.tasks.filter((t) => t.status !== "deleted");
}

export function selectTasksByStatus(state: TaskState, status: TaskStatus): Task[] {
	return state.tasks.filter((t) => t.status === status);
}

export interface TodoCounts {
	pending: number;
	in_progress: number;
	completed: number;
	deleted: number;
}

export function selectTodoCounts(state: TaskState): TodoCounts {
	const counts: TodoCounts = { pending: 0, in_progress: 0, completed: 0, deleted: 0 };
	for (const t of state.tasks) counts[t.status]++;
	return counts;
}
