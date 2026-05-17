/**
 * Pure invariants and graph helpers for the task model.
 */

import type { Task, TaskStatus } from "./types.ts";

export function isTransitionValid(from: TaskStatus, to: TaskStatus): boolean {
	if (from === to) return false;
	if (from === "deleted") return false;
	if (to === "deleted") return true;
	if (to === "completed") return true;
	if (from === "completed") return false;
	if (from === "pending" && to === "in_progress") return true;
	if (from === "in_progress" && to === "pending") return true;
	return false;
}

export function detectCycle(tasks: Task[], startId: number, candidateBlockers: number[]): boolean {
	const byId = new Map<number, Task>();
	for (const t of tasks) byId.set(t.id, t);

	const merged = new Set<number>();
	const start = byId.get(startId);
	if (start) for (const b of start.blockedBy) merged.add(b);
	for (const b of candidateBlockers) merged.add(b);

	const stack = [...merged];
	const seen = new Set<number>();
	while (stack.length > 0) {
		const id = stack.pop()!;
		if (id === startId) return true;
		if (seen.has(id)) continue;
		seen.add(id);
		const node = byId.get(id);
		if (!node) continue;
		for (const dep of node.blockedBy) stack.push(dep);
	}
	return false;
}

export function deriveBlocks(tasks: Task[]): Map<number, number[]> {
	const blocks = new Map<number, number[]>();
	for (const t of tasks) {
		for (const dep of t.blockedBy) {
			const list = blocks.get(dep) ?? [];
			list.push(t.id);
			blocks.set(dep, list);
		}
	}
	return blocks;
}
