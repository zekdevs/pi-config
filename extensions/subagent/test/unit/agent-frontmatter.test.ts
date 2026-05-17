import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, it } from "node:test";
import { serializeAgent } from "../../src/agents/agent-serializer.ts";
import { discoverAgents, discoverAgentsAll, type AgentConfig } from "../../src/agents/agents.ts";

const tempDirs: string[] = [];

afterEach(() => {
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop();
		if (!dir) continue;
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

describe("agent frontmatter defaultContext", () => {
	it("serializes defaultContext into agent frontmatter", () => {
		const agent: AgentConfig = {
			name: "worker",
			description: "Worker",
			systemPrompt: "Do work",
			systemPromptMode: "replace",
			inheritProjectContext: true,
			inheritSkills: false,
			source: "project",
			filePath: "/tmp/worker.md",
			defaultContext: "fork",
		};

		const serialized = serializeAgent(agent);
		assert.match(serialized, /defaultContext: fork/);
	});

	it("parses defaultContext from discovered agent frontmatter", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-agent-default-context-"));
		tempDirs.push(dir);
		const agentsDir = path.join(dir, ".pi", "agents");
		fs.mkdirSync(agentsDir, { recursive: true });
		fs.writeFileSync(path.join(agentsDir, "worker.md"), `---
name: worker
description: Worker
defaultContext: fork
---

Do work
`, "utf-8");

		const result = discoverAgents(dir, "project");
		const worker = result.agents.find((agent) => agent.name === "worker");
		assert.equal(worker?.defaultContext, "fork");
	});

	it("loads packaged planner, worker, and oracle with fork defaultContext", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-builtin-default-context-"));
		tempDirs.push(dir);
		const agents = discoverAgents(dir, "both").agents;

		for (const name of ["planner", "worker", "oracle"]) {
			const agent = agents.find((candidate) => candidate.name === name && candidate.source === "builtin");
			assert.equal(agent?.defaultContext, "fork", `${name} should default to fork context`);
		}
	});
});

describe("agent frontmatter maxSubagentDepth", () => {
	it("serializes maxSubagentDepth into agent frontmatter", () => {
		const agent: AgentConfig = {
			name: "scout",
			description: "Scout",
			systemPrompt: "Inspect code",
			systemPromptMode: "replace",
			inheritProjectContext: false,
			inheritSkills: false,
			source: "project",
			filePath: "/tmp/scout.md",
			maxSubagentDepth: 1,
		};

		const serialized = serializeAgent(agent);
		assert.match(serialized, /maxSubagentDepth: 1/);
	});

	it("parses maxSubagentDepth from discovered agent frontmatter", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-agent-frontmatter-"));
		tempDirs.push(dir);
		const agentsDir = path.join(dir, ".pi", "agents");
		fs.mkdirSync(agentsDir, { recursive: true });
		fs.writeFileSync(path.join(agentsDir, "scout.md"), `---
name: scout
description: Scout
maxSubagentDepth: 1
---

Inspect code
`, "utf-8");

		const result = discoverAgents(dir, "project");
		const scout = result.agents.find((agent) => agent.name === "scout");
		assert.equal(scout?.maxSubagentDepth, 1);
	});
});

describe("agent frontmatter fallbackModels", () => {
	it("serializes fallbackModels into agent frontmatter", () => {
		const agent: AgentConfig = {
			name: "worker",
			description: "Worker",
			systemPrompt: "Do work",
			systemPromptMode: "replace",
			inheritProjectContext: false,
			inheritSkills: false,
			source: "project",
			filePath: "/tmp/worker.md",
			fallbackModels: ["openai/gpt-5-mini", "anthropic/claude-sonnet-4"],
		};

		const serialized = serializeAgent(agent);
		assert.match(serialized, /fallbackModels: openai\/gpt-5-mini, anthropic\/claude-sonnet-4/);
	});

	it("parses fallbackModels from discovered agent frontmatter", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-agent-fallback-frontmatter-"));
		tempDirs.push(dir);
		const agentsDir = path.join(dir, ".pi", "agents");
		fs.mkdirSync(agentsDir, { recursive: true });
		fs.writeFileSync(path.join(agentsDir, "worker.md"), `---
name: worker
description: Worker
fallbackModels: openai/gpt-5-mini, anthropic/claude-sonnet-4
---

Do work
`, "utf-8");

		const result = discoverAgents(dir, "project");
		const worker = result.agents.find((agent) => agent.name === "worker");
		assert.deepEqual(worker?.fallbackModels, ["openai/gpt-5-mini", "anthropic/claude-sonnet-4"]);
	});
});

describe("agent frontmatter systemPromptMode", () => {
	it("serializes systemPromptMode into agent frontmatter", () => {
		const agent: AgentConfig = {
			name: "worker",
			description: "Worker",
			systemPrompt: "Do work",
			systemPromptMode: "replace",
			inheritProjectContext: false,
			inheritSkills: false,
			source: "project",
			filePath: "/tmp/worker.md",
		};

		const serialized = serializeAgent(agent);
		assert.match(serialized, /systemPromptMode: replace/);
	});

	it("parses systemPromptMode from discovered agent frontmatter", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-agent-prompt-mode-frontmatter-"));
		tempDirs.push(dir);
		const agentsDir = path.join(dir, ".pi", "agents");
		fs.mkdirSync(agentsDir, { recursive: true });
		fs.writeFileSync(path.join(agentsDir, "worker.md"), `---
name: worker
description: Worker
systemPromptMode: replace
---

Do work
`, "utf-8");

		const result = discoverAgents(dir, "project");
		const worker = result.agents.find((agent) => agent.name === "worker");
		assert.equal(worker?.systemPromptMode, "replace");
	});
});

describe("agent frontmatter prompt inheritance flags", () => {
	it("serializes inheritProjectContext and inheritSkills into agent frontmatter", () => {
		const agent: AgentConfig = {
			name: "worker",
			description: "Worker",
			systemPrompt: "Do work",
			systemPromptMode: "replace",
			inheritProjectContext: true,
			inheritSkills: true,
			source: "project",
			filePath: "/tmp/worker.md",
		};

		const serialized = serializeAgent(agent);
		assert.match(serialized, /inheritProjectContext: true/);
		assert.match(serialized, /inheritSkills: true/);
	});

	it("parses inheritProjectContext and inheritSkills from discovered agent frontmatter", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-agent-prompt-inheritance-frontmatter-"));
		tempDirs.push(dir);
		const agentsDir = path.join(dir, ".pi", "agents");
		fs.mkdirSync(agentsDir, { recursive: true });
		fs.writeFileSync(path.join(agentsDir, "worker.md"), `---
name: worker
description: Worker
inheritProjectContext: true
inheritSkills: true
---

Do work
`, "utf-8");

		const result = discoverAgents(dir, "project");
		const worker = result.agents.find((agent) => agent.name === "worker");
		assert.equal(worker?.inheritProjectContext, true);
		assert.equal(worker?.inheritSkills, true);
	});
});

describe("agent frontmatter prompt assembly defaults", () => {
	it("defaults ordinary agents to replace mode with no inherited context or skills", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-agent-default-prompt-settings-"));
		tempDirs.push(dir);
		const agentsDir = path.join(dir, ".pi", "agents");
		fs.mkdirSync(agentsDir, { recursive: true });
		fs.writeFileSync(path.join(agentsDir, "worker.md"), `---
name: worker
description: Worker
---

Do work
`, "utf-8");

		const result = discoverAgents(dir, "project");
		const worker = result.agents.find((agent) => agent.name === "worker");
		assert.equal(worker?.systemPromptMode, "replace");
		assert.equal(worker?.inheritProjectContext, false);
		assert.equal(worker?.inheritSkills, false);
	});

	it("builtin agents inherit project context by default", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-builtin-default-prompt-settings-"));
		const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-builtin-default-home-"));
		tempDirs.push(dir);
		tempDirs.push(homeDir);
		const previousHome = process.env.HOME;
		const previousUserProfile = process.env.USERPROFILE;

		try {
			process.env.HOME = homeDir;
			process.env.USERPROFILE = homeDir;

			const result = discoverAgents(dir, "both");
			const scout = result.agents.find((agent) => agent.name === "scout");
			const reviewer = result.agents.find((agent) => agent.name === "reviewer");
			const delegate = result.agents.find((agent) => agent.name === "delegate");
			assert.equal(scout?.inheritProjectContext, true);
			assert.equal(reviewer?.inheritProjectContext, true);
			assert.equal(delegate?.inheritProjectContext, true);
		} finally {
			if (previousHome === undefined) delete process.env.HOME;
			else process.env.HOME = previousHome;
			if (previousUserProfile === undefined) delete process.env.USERPROFILE;
			else process.env.USERPROFILE = previousUserProfile;
		}
	});

	it("bundled agents all have explicit tool allowlists", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-builtin-tools-"));
		const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-builtin-tools-home-"));
		tempDirs.push(dir);
		tempDirs.push(homeDir);
		const previousHome = process.env.HOME;
		const previousUserProfile = process.env.USERPROFILE;

		try {
			process.env.HOME = homeDir;
			process.env.USERPROFILE = homeDir;
			const builtins = discoverAgentsAll(dir).builtin;
			assert.ok(builtins.length > 0);
			for (const agent of builtins) {
				assert.ok(agent.tools && agent.tools.length > 0, `${agent.name} should have explicit tools frontmatter`);
			}
		} finally {
			if (previousHome === undefined) delete process.env.HOME;
			else process.env.HOME = previousHome;
			if (previousUserProfile === undefined) delete process.env.USERPROFILE;
			else process.env.USERPROFILE = previousUserProfile;
		}
	});

	it("worker and delegate include the child-facing supervisor tool", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-builtin-supervisor-tool-"));
		const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-builtin-supervisor-tool-home-"));
		tempDirs.push(dir);
		tempDirs.push(homeDir);
		const previousHome = process.env.HOME;
		const previousUserProfile = process.env.USERPROFILE;

		try {
			process.env.HOME = homeDir;
			process.env.USERPROFILE = homeDir;
			const agents = discoverAgentsAll(dir).builtin;
			for (const name of ["worker", "delegate"]) {
				const agent = agents.find((candidate) => candidate.name === name);
				assert.ok(agent, `${name} builtin should be discovered`);
				assert.deepEqual(agent?.tools, ["read", "grep", "find", "ls", "bash", "edit", "write", "contact_supervisor"]);
			}
		} finally {
			if (previousHome === undefined) delete process.env.HOME;
			else process.env.HOME = previousHome;
			if (previousUserProfile === undefined) delete process.env.USERPROFILE;
			else process.env.USERPROFILE = previousUserProfile;
		}
	});

	it("defaults delegate to append mode with inherited project context", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-agent-delegate-default-prompt-settings-"));
		tempDirs.push(dir);
		const agentsDir = path.join(dir, ".pi", "agents");
		fs.mkdirSync(agentsDir, { recursive: true });
		fs.writeFileSync(path.join(agentsDir, "delegate.md"), `---
name: delegate
description: Delegate
---

Do work
`, "utf-8");

		const result = discoverAgents(dir, "project");
		const delegate = result.agents.find((agent) => agent.name === "delegate");
		assert.equal(delegate?.systemPromptMode, "append");
		assert.equal(delegate?.inheritProjectContext, true);
		assert.equal(delegate?.inheritSkills, false);
	});
});

describe("packaged agent discovery", () => {
	it("registers packaged agents by runtime name and serializes local name plus package", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-packaged-agent-"));
		tempDirs.push(dir);
		const agentsDir = path.join(dir, ".pi", "agents");
		fs.mkdirSync(agentsDir, { recursive: true });
		fs.writeFileSync(path.join(agentsDir, "scout.md"), `---
name: scout
package: code-analysis
description: Fast recon
---

Inspect code
`, "utf-8");

		const scout = discoverAgents(dir, "project").agents.find((agent) => agent.name === "code-analysis.scout");
		assert.ok(scout);
		assert.equal(scout.localName, "scout");
		assert.equal(scout.packageName, "code-analysis");
		const serialized = serializeAgent(scout);
		assert.match(serialized, /^name: scout$/m);
		assert.match(serialized, /^package: code-analysis$/m);
		assert.doesNotMatch(serialized, /^name: code-analysis\.scout$/m);
	});

	it("keeps packaged and un-packaged runtime names distinct while preserving un-packaged precedence", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-packaged-collisions-"));
		tempDirs.push(dir);
		fs.mkdirSync(path.join(dir, ".agents"), { recursive: true });
		fs.mkdirSync(path.join(dir, ".pi", "agents"), { recursive: true });
		fs.writeFileSync(path.join(dir, ".agents", "scout.md"), `---
name: scout
description: Legacy scout
---

Legacy
`, "utf-8");
		fs.writeFileSync(path.join(dir, ".pi", "agents", "scout.md"), `---
name: scout
description: Project scout
---

Project
`, "utf-8");
		fs.writeFileSync(path.join(dir, ".pi", "agents", "packaged.md"), `---
name: scout
package: code-analysis
description: Packaged scout
---

Packaged
`, "utf-8");

		const agents = discoverAgents(dir, "project").agents;
		const unqualified = agents.find((agent) => agent.name === "scout");
		const packaged = agents.find((agent) => agent.name === "code-analysis.scout");
		assert.equal(unqualified?.description, "Project scout");
		assert.equal(unqualified?.filePath, path.join(dir, ".pi", "agents", "scout.md"));
		assert.equal(packaged?.description, "Packaged scout");
	});
});

describe("project agent directory discovery", () => {
	it("discovers project agents from both .agents and .pi/agents", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-project-agent-dirs-"));
		tempDirs.push(dir);
		fs.mkdirSync(path.join(dir, ".agents", "skills"), { recursive: true });
		fs.mkdirSync(path.join(dir, ".pi", "agents"), { recursive: true });
		fs.writeFileSync(path.join(dir, ".agents", "legacy.md"), `---
name: legacy
description: Legacy
---

Legacy prompt
`, "utf-8");
		fs.writeFileSync(path.join(dir, ".pi", "agents", "canonical.md"), `---
name: canonical
description: Canonical
---

Canonical prompt
`, "utf-8");

		const result = discoverAgents(dir, "project");
		assert.ok(result.agents.find((agent) => agent.name === "legacy" && agent.filePath === path.join(dir, ".agents", "legacy.md")));
		assert.ok(result.agents.find((agent) => agent.name === "canonical" && agent.filePath === path.join(dir, ".pi", "agents", "canonical.md")));
		assert.equal(result.projectAgentsDir, path.join(dir, ".pi", "agents"));
	});

	it("uses the project root for the canonical project agent dir even when only .agents exists", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-project-agent-root-"));
		tempDirs.push(dir);
		const nested = path.join(dir, "packages", "app");
		fs.mkdirSync(path.join(dir, ".agents", "skills"), { recursive: true });
		fs.mkdirSync(nested, { recursive: true });

		const result = discoverAgentsAll(nested);
		assert.equal(result.projectDir, path.join(dir, ".pi", "agents"));
	});
});
