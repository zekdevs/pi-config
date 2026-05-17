import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerEditTool } from "./src/edit.ts";
import { registerReadTool } from "./src/read.ts";

export default function (pi: ExtensionAPI): void {
	registerReadTool(pi);
	registerEditTool(pi);
}
