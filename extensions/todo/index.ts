/**
 * Todo extension entry point.
 *
 * Registers the `todo` tool, the `/todos` slash command, and wires session lifecycle
 * events (session_start / session_compact / session_tree) to replay state from the branch.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { replayFromBranch } from "./src/replay.ts";
import { replaceState } from "./src/store.ts";
import { registerTodoTool } from "./src/todo-tool.ts";
import { registerTodosCommand } from "./src/todos-command.ts";

export default function (pi: ExtensionAPI): void {
	registerTodoTool(pi);
	registerTodosCommand(pi);

	pi.on("session_start", async (_event, ctx) => {
		replaceState(replayFromBranch(ctx));
	});
	pi.on("session_compact", async (_event, ctx) => {
		replaceState(replayFromBranch(ctx));
	});
	pi.on("session_tree", async (_event, ctx) => {
		replaceState(replayFromBranch(ctx));
	});
}
