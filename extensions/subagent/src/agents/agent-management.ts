import * as fs from "node:fs";
import * as path from "node:path";
import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	type AgentConfig,
	type AgentScope,
	type AgentSource,
	defaultInheritProjectContext,
	defaultInheritSkills,
	defaultSystemPromptMode,
	discoverAgentsAll,
	buildRuntimeName,
	frontmatterNameForConfig,
	parsePackageName,
} from "./agents.ts";
import { serializeAgent } from "./agent-serializer.ts";
import { discoverAvailableSkills } from "./skills.ts";
import type { Details } from "../shared/types.ts";

type ManagementAction = "list" | "get" | "create" | "update" | "delete";
type ManagementScope = "user" | "project";
type ManagementContext = Pick<ExtensionContext, "cwd" | "modelRegistry">;

interface ManagementParams {
	action?: string;
	agent?: string;
	agentScope?: string;
	config?: unknown;
}

function result(text: string, isError = false): AgentToolResult<Details> {
	return { content: [{ type: "text", text }], isError, details: { mode: "management", results: [] } };
}

function parseCsv(value: string): string[] {
	return [...new Set(value.split(",").map((v) => v.trim()).filter(Boolean))];
}

function configObject(config: unknown): { value?: Record<string, unknown>; error?: string } {
	let val = config;
	if (typeof val === "string") {
		try {
			val = JSON.parse(val);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return { error: `config must be valid JSON: ${message}` };
		}
	}
	if (!val || typeof val !== "object" || Array.isArray(val)) return {};
	return { value: val as Record<string, unknown> };
}

function hasKey(obj: Record<string, unknown>, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(obj, key);
}

function asDisambiguationScope(scope: unknown): ManagementScope | undefined {
	if (scope === "user" || scope === "project") return scope;
	return undefined;
}

function normalizeListScope(scope: unknown): AgentScope | undefined {
	if (scope === undefined) return "both";
	if (scope === "user" || scope === "project" || scope === "both") return scope;
	return undefined;
}

function sanitizeName(name: string): string {
	return name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
}

function parsePackageConfig(value: unknown): { packageName?: string; error?: string } {
	return parsePackageName(value, "config.package");
}

function allAgents(d: { builtin: AgentConfig[]; user: AgentConfig[]; project: AgentConfig[] }): AgentConfig[] {
	return [...d.builtin, ...d.user, ...d.project];
}

function availableAgentNames(cwd: string): string[] {
	const d = discoverAgentsAll(cwd);
	return [...new Set(allAgents(d).map((x) => x.name))].sort((a, b) => a.localeCompare(b));
}

function findAgents(name: string, cwd: string, scope: AgentScope = "both"): AgentConfig[] {
	const d = discoverAgentsAll(cwd);
	const raw = name.trim();
	const sanitized = sanitizeName(raw);
	return allAgents(d)
		.filter((a) => (scope === "both" || a.source === scope) && (a.name === raw || a.name === sanitized))
		.sort((a, b) => a.source.localeCompare(b.source));
}

function nameExistsInScope(cwd: string, scope: ManagementScope, name: string, excludePath?: string): boolean {
	const d = discoverAgentsAll(cwd);
	for (const a of scope === "user" ? d.user : d.project) {
		if (a.name === name && a.filePath !== excludePath) return true;
	}
	return false;
}

function modelWarning(ctx: ManagementContext, model: string | undefined): string | undefined {
	if (!model) return undefined;
	const found = ctx.modelRegistry.getAvailable().some((m) => `${m.provider}/${m.id}` === model || m.id === model);
	return found ? undefined : `Warning: model '${model}' is not in the current model registry.`;
}

function fallbackModelsWarning(ctx: ManagementContext, fallbackModels: string[] | undefined): string | undefined {
	if (!fallbackModels || fallbackModels.length === 0) return undefined;
	const available = new Set(ctx.modelRegistry.getAvailable().flatMap((m) => [`${m.provider}/${m.id}`, m.id]));
	const missing = fallbackModels.filter((model) => !available.has(model));
	return missing.length ? `Warning: fallback models not in the current model registry: ${missing.join(", ")}.` : undefined;
}

function skillsWarning(cwd: string, skills: string[] | undefined): string | undefined {
	if (!skills || skills.length === 0) return undefined;
	const available = new Set(discoverAvailableSkills(cwd).map((s) => s.name));
	const missing = skills.filter((s) => !available.has(s));
	return missing.length ? `Warning: skills not found: ${missing.join(", ")}.` : undefined;
}

function parseTools(raw: string): { tools?: string[]; mcpDirectTools?: string[] } {
	const tools: string[] = [];
	const mcpDirectTools: string[] = [];
	for (const item of parseCsv(raw)) {
		if (item.startsWith("mcp:")) {
			const direct = item.slice(4).trim();
			if (direct) mcpDirectTools.push(direct);
		} else tools.push(item);
	}
	return { tools: tools.length ? tools : undefined, mcpDirectTools: mcpDirectTools.length ? mcpDirectTools : undefined };
}

function applyAgentConfig(target: AgentConfig, cfg: Record<string, unknown>): string | undefined {
	if (hasKey(cfg, "systemPrompt")) {
		if (cfg.systemPrompt === false || cfg.systemPrompt === "") target.systemPrompt = "";
		else if (typeof cfg.systemPrompt === "string") target.systemPrompt = cfg.systemPrompt;
		else return "config.systemPrompt must be a string or false when provided.";
	}
	if (hasKey(cfg, "model")) {
		if (cfg.model === false || cfg.model === "") target.model = undefined;
		else if (typeof cfg.model === "string") target.model = cfg.model.trim() || undefined;
		else return "config.model must be a string or false when provided.";
	}
	if (hasKey(cfg, "fallbackModels")) {
		if (cfg.fallbackModels === false || cfg.fallbackModels === "") target.fallbackModels = undefined;
		else if (typeof cfg.fallbackModels === "string") {
			const models = parseCsv(cfg.fallbackModels);
			target.fallbackModels = models.length ? models : undefined;
		} else if (Array.isArray(cfg.fallbackModels)) {
			const models = cfg.fallbackModels
				.filter((value): value is string => typeof value === "string")
				.map((value) => value.trim())
				.filter(Boolean);
			target.fallbackModels = models.length ? [...new Set(models)] : undefined;
		} else return "config.fallbackModels must be a comma-separated string, string array, or false when provided.";
	}
	if (hasKey(cfg, "tools")) {
		if (cfg.tools === false || cfg.tools === "") { target.tools = undefined; target.mcpDirectTools = undefined; }
		else if (typeof cfg.tools === "string") { const parsed = parseTools(cfg.tools); target.tools = parsed.tools; target.mcpDirectTools = parsed.mcpDirectTools; }
		else return "config.tools must be a comma-separated string or false when provided.";
	}
	if (hasKey(cfg, "skills")) {
		if (cfg.skills === false || cfg.skills === "") target.skills = undefined;
		else if (typeof cfg.skills === "string") { const skills = parseCsv(cfg.skills); target.skills = skills.length ? skills : undefined; }
		else return "config.skills must be a comma-separated string or false when provided.";
	}
	if (hasKey(cfg, "extensions")) {
		if (cfg.extensions === false) target.extensions = undefined;
		else if (cfg.extensions === "") target.extensions = [];
		else if (typeof cfg.extensions === "string") target.extensions = parseCsv(cfg.extensions);
		else return "config.extensions must be a comma-separated string, empty string, or false when provided.";
	}
	if (hasKey(cfg, "thinking")) {
		if (cfg.thinking === false || cfg.thinking === "") target.thinking = undefined;
		else if (typeof cfg.thinking === "string") target.thinking = cfg.thinking.trim() || undefined;
		else return "config.thinking must be a string or false when provided.";
	}
	if (hasKey(cfg, "systemPromptMode")) {
		if (cfg.systemPromptMode === "append" || cfg.systemPromptMode === "replace") target.systemPromptMode = cfg.systemPromptMode;
		else return "config.systemPromptMode must be 'append' or 'replace' when provided.";
	}
	if (hasKey(cfg, "inheritProjectContext")) {
		if (typeof cfg.inheritProjectContext !== "boolean") return "config.inheritProjectContext must be a boolean when provided.";
		target.inheritProjectContext = cfg.inheritProjectContext;
	}
	if (hasKey(cfg, "inheritSkills")) {
		if (typeof cfg.inheritSkills !== "boolean") return "config.inheritSkills must be a boolean when provided.";
		target.inheritSkills = cfg.inheritSkills;
	}
	if (hasKey(cfg, "defaultContext")) {
		if (cfg.defaultContext === false || cfg.defaultContext === "") target.defaultContext = undefined;
		else if (cfg.defaultContext === "fresh" || cfg.defaultContext === "fork") target.defaultContext = cfg.defaultContext;
		else return "config.defaultContext must be 'fresh', 'fork', or false when provided.";
	}
	if (hasKey(cfg, "output")) {
		if (cfg.output === false || cfg.output === "") target.output = undefined;
		else if (typeof cfg.output === "string") target.output = cfg.output;
		else return "config.output must be a string or false when provided.";
	}
	if (hasKey(cfg, "reads")) {
		if (cfg.reads === false || cfg.reads === "") target.defaultReads = undefined;
		else if (typeof cfg.reads === "string") {
			const reads = parseCsv(cfg.reads);
			target.defaultReads = reads.length ? reads : undefined;
		} else return "config.reads must be a comma-separated string or false when provided.";
	}
	if (hasKey(cfg, "progress")) {
		if (typeof cfg.progress !== "boolean") return "config.progress must be a boolean when provided.";
		target.defaultProgress = cfg.progress;
	}
	if (hasKey(cfg, "maxSubagentDepth")) {
		if (cfg.maxSubagentDepth === false || cfg.maxSubagentDepth === "") target.maxSubagentDepth = undefined;
		else if (typeof cfg.maxSubagentDepth === "number" && Number.isInteger(cfg.maxSubagentDepth) && cfg.maxSubagentDepth >= 0) {
			target.maxSubagentDepth = cfg.maxSubagentDepth;
		} else return "config.maxSubagentDepth must be an integer >= 0 or false when provided.";
	}
	return undefined;
}

function resolveTarget(
	name: string,
	matches: AgentConfig[],
	cwd: string,
	scopeHint?: string,
): AgentConfig | AgentToolResult<Details> {
	const mutable = matches.filter((m) => m.source !== "builtin");
	if (mutable.length === 0) {
		if (matches.length > 0) {
			return result(`Agent '${name}' is builtin and cannot be modified. Create a same-named agent in user or project scope to override it.`, true);
		}
		const available = availableAgentNames(cwd);
		return result(`Agent '${name}' not found. Available: ${available.join(", ") || "none"}.`, true);
	}
	if (mutable.length === 1) return mutable[0]!;
	const scope = asDisambiguationScope(scopeHint);
	if (!scope) {
		const paths = mutable.map((m) => `${m.source}: ${m.filePath}`).join("\n");
		return result(`Agent '${name}' exists in both scopes. Specify agentScope: 'user' or 'project'.\n${paths}`, true);
	}
	const scoped = mutable.filter((m) => m.source === scope);
	if (scoped.length === 0) return result(`Agent '${name}' not found in scope '${scope}'.`, true);
	if (scoped.length > 1) return result(`Multiple agents named '${name}' found in scope '${scope}': ${scoped.map((m) => m.filePath).join(", ")}`, true);
	return scoped[0]!;
}

function renamePath(
	currentPath: string,
	newName: string,
	scope: ManagementScope,
	cwd: string,
): { filePath?: string; error?: string } {
	if (nameExistsInScope(cwd, scope, newName, currentPath)) return { error: `Name '${newName}' already exists in ${scope} scope.` };
	const filePath = path.join(path.dirname(currentPath), `${newName}.md`);
	if (fs.existsSync(filePath) && filePath !== currentPath) {
		return { error: `File already exists at ${filePath} but is not a valid agent definition. Remove or rename it first.` };
	}
	fs.renameSync(currentPath, filePath);
	return { filePath };
}

function formatAgentDetail(agent: AgentConfig): string {
	const tools = [...(agent.tools ?? []), ...(agent.mcpDirectTools ?? []).map((t) => `mcp:${t}`)];
	const lines: string[] = [`Agent: ${agent.name} (${agent.source})`, `Path: ${agent.filePath}`, `Description: ${agent.description}`];
	if (agent.packageName) {
		lines.push(`Local name: ${frontmatterNameForConfig(agent)}`);
		lines.push(`Package: ${agent.packageName}`);
	}
	if (agent.model) lines.push(`Model: ${agent.model}`);
	if (agent.fallbackModels?.length) lines.push(`Fallback models: ${agent.fallbackModels.join(", ")}`);
	if (tools.length) lines.push(`Tools: ${tools.join(", ")}`);
	if (agent.skills?.length) lines.push(`Skills: ${agent.skills.join(", ")}`);
	lines.push(`System prompt mode: ${agent.systemPromptMode}`);
	lines.push(`Inherit project context: ${agent.inheritProjectContext ? "true" : "false"}`);
	lines.push(`Inherit skills: ${agent.inheritSkills ? "true" : "false"}`);
	if (agent.defaultContext) lines.push(`Default context: ${agent.defaultContext}`);
	if (agent.source === "builtin") lines.push(`Disabled: ${agent.disabled ? "true" : "false"}`);
	if (agent.extensions !== undefined) lines.push(`Extensions: ${agent.extensions.length ? agent.extensions.join(", ") : "(none)"}`);
	if (agent.thinking) lines.push(`Thinking: ${agent.thinking}`);
	if (agent.output) lines.push(`Output: ${agent.output}`);
	if (agent.defaultReads?.length) lines.push(`Reads: ${agent.defaultReads.join(", ")}`);
	if (agent.defaultProgress) lines.push("Progress: true");
	if (agent.maxSubagentDepth !== undefined) lines.push(`Max subagent depth: ${agent.maxSubagentDepth}`);
	if (agent.systemPrompt.trim()) lines.push("", "System Prompt:", agent.systemPrompt);
	return lines.join("\n");
}

export function handleList(params: ManagementParams, ctx: ManagementContext): AgentToolResult<Details> {
	const scope = normalizeListScope(params.agentScope) ?? "both";
	const d = discoverAgentsAll(ctx.cwd);
	const scopedAgents = allAgents(d).filter((a) => scope === "both" || a.source === "builtin" || a.source === scope).sort((a, b) => a.name.localeCompare(b.name));
	const agents = scopedAgents.filter((a) => !a.disabled);
	const lines = [
		"Executable agents:",
		...(agents.length
			? agents.map((a) => `- ${a.name} (${a.source}${a.defaultContext ? `, context: ${a.defaultContext}` : ""}): ${a.description}`)
			: ["- (none)"]),
	];
	return result(lines.join("\n"));
}

function handleGet(params: ManagementParams, ctx: ManagementContext): AgentToolResult<Details> {
	if (!params.agent) return result("Specify 'agent' for get.", true);
	const matches = findAgents(params.agent, ctx.cwd, "both");
	if (!matches.length) {
		return result(`Agent '${params.agent}' not found. Available: ${availableAgentNames(ctx.cwd).join(", ") || "none"}.`, true);
	}
	return result(matches.map(formatAgentDetail).join("\n\n"));
}

export function handleCreate(params: ManagementParams, ctx: ManagementContext): AgentToolResult<Details> {
	const parsedConfig = configObject(params.config);
	if (parsedConfig.error) return result(parsedConfig.error, true);
	const cfg = parsedConfig.value;
	if (!cfg) return result("config required for create.", true);
	if (typeof cfg.name !== "string" || !cfg.name.trim()) return result("config.name is required and must be a non-empty string.", true);
	if (typeof cfg.description !== "string" || !cfg.description.trim()) return result("config.description is required and must be a non-empty string.", true);
	const name = sanitizeName(cfg.name);
	if (!name) return result("config.name is invalid after sanitization. Use letters, numbers, spaces, or hyphens.", true);
	const parsedPackage = parsePackageConfig(cfg.package);
	if (parsedPackage.error) return result(parsedPackage.error, true);
	const runtimeName = buildRuntimeName(name, parsedPackage.packageName);
	const scopeRaw = cfg.scope ?? "user";
	if (scopeRaw !== "user" && scopeRaw !== "project") return result("config.scope must be 'user' or 'project'.", true);
	const scope = scopeRaw as ManagementScope;
	const d = discoverAgentsAll(ctx.cwd);
	const targetDir = scope === "user" ? d.userDir : d.projectDir ?? path.join(ctx.cwd, ".pi", "agents");
	fs.mkdirSync(targetDir, { recursive: true });
	if (nameExistsInScope(ctx.cwd, scope, runtimeName)) return result(`Name '${runtimeName}' already exists in ${scope} scope. Use update instead.`, true);
	const targetPath = path.join(targetDir, `${runtimeName}.md`);
	if (fs.existsSync(targetPath)) return result(`File already exists at ${targetPath} but is not a valid agent definition. Remove or rename it first.`, true);
	const warnings: string[] = [];
	if (d.builtin.some((a) => a.name === runtimeName)) warnings.push(`Note: this shadows the builtin agent '${runtimeName}'.`);
	const agent: AgentConfig = {
		name: runtimeName,
		localName: name,
		packageName: parsedPackage.packageName,
		description: cfg.description.trim(),
		source: scope,
		filePath: targetPath,
		systemPrompt: "",
		systemPromptMode: defaultSystemPromptMode(name),
		inheritProjectContext: defaultInheritProjectContext(name),
		inheritSkills: defaultInheritSkills(),
	};
	const applyError = applyAgentConfig(agent, cfg);
	if (applyError) return result(applyError, true);
	const mw = modelWarning(ctx, agent.model);
	if (mw) warnings.push(mw);
	const fmw = fallbackModelsWarning(ctx, agent.fallbackModels);
	if (fmw) warnings.push(fmw);
	const sw = skillsWarning(ctx.cwd, agent.skills);
	if (sw) warnings.push(sw);
	fs.writeFileSync(targetPath, serializeAgent(agent), "utf-8");
	return result([`Created agent '${runtimeName}' at ${targetPath}.`, ...warnings].join("\n"));
}

export function handleUpdate(params: ManagementParams, ctx: ManagementContext): AgentToolResult<Details> {
	if (!params.agent) return result("Specify 'agent' for update.", true);
	const parsedConfig = configObject(params.config);
	if (parsedConfig.error) return result(parsedConfig.error, true);
	const cfg = parsedConfig.value;
	if (!cfg) return result("config required for update.", true);
	const warnings: string[] = [];
	const scopeHint = asDisambiguationScope(params.agentScope);
	const targetOrError = resolveTarget(params.agent, findAgents(params.agent, ctx.cwd, scopeHint ?? "both"), ctx.cwd, params.agentScope);
	if ("content" in targetOrError) return targetOrError;
	const target = targetOrError;
	const updated: AgentConfig = { ...target };
	const oldName = target.name;
	if (hasKey(cfg, "name") && (typeof cfg.name !== "string" || !cfg.name.trim())) return result("config.name must be a non-empty string when provided.", true);
	if (hasKey(cfg, "description") && (typeof cfg.description !== "string" || !cfg.description.trim())) return result("config.description must be a non-empty string when provided.", true);
	let newLocalName = target.localName ?? frontmatterNameForConfig(target);
	if (hasKey(cfg, "name")) {
		newLocalName = sanitizeName(cfg.name as string);
		if (!newLocalName) return result("config.name is invalid after sanitization.", true);
	}
	let newPackageName = target.packageName;
	if (hasKey(cfg, "package")) {
		const parsedPackage = parsePackageConfig(cfg.package);
		if (parsedPackage.error) return result(parsedPackage.error, true);
		newPackageName = parsedPackage.packageName;
	}
	const applyError = applyAgentConfig(updated, cfg);
	if (applyError) return result(applyError, true);
	updated.localName = newLocalName;
	updated.packageName = newPackageName;
	updated.name = buildRuntimeName(newLocalName, newPackageName);
	if (hasKey(cfg, "description")) updated.description = (cfg.description as string).trim();
	if (hasKey(cfg, "model")) {
		const mw = modelWarning(ctx, updated.model);
		if (mw) warnings.push(mw);
	}
	if (hasKey(cfg, "fallbackModels")) {
		const fmw = fallbackModelsWarning(ctx, updated.fallbackModels);
		if (fmw) warnings.push(fmw);
	}
	if (hasKey(cfg, "skills")) {
		const sw = skillsWarning(ctx.cwd, updated.skills);
		if (sw) warnings.push(sw);
	}
	if (updated.name !== oldName) {
		const renamed = renamePath(target.filePath, updated.name, target.source, ctx.cwd);
		if (renamed.error) return result(renamed.error, true);
		updated.filePath = renamed.filePath!;
	}
	fs.writeFileSync(updated.filePath, serializeAgent(updated), "utf-8");
	const headline = updated.name === oldName
		? `Updated agent '${updated.name}' at ${updated.filePath}.`
		: `Updated agent '${oldName}' to '${updated.name}' at ${updated.filePath}.`;
	return result([headline, ...warnings].join("\n"));
}

function handleDelete(params: ManagementParams, ctx: ManagementContext): AgentToolResult<Details> {
	if (!params.agent) return result("Specify 'agent' for delete.", true);
	const scopeHint = asDisambiguationScope(params.agentScope);
	const targetOrError = resolveTarget(params.agent, findAgents(params.agent, ctx.cwd, scopeHint ?? "both"), ctx.cwd, params.agentScope);
	if ("content" in targetOrError) return targetOrError;
	const target = targetOrError;
	fs.unlinkSync(target.filePath);
	return result(`Deleted agent '${target.name}' at ${target.filePath}.`);
}

export function handleManagementAction(action: string, params: ManagementParams, ctx: ManagementContext): AgentToolResult<Details> {
	switch (action as ManagementAction) {
		case "list": return handleList(params, ctx);
		case "get": return handleGet(params, ctx);
		case "create": return handleCreate(params, ctx);
		case "update": return handleUpdate(params, ctx);
		case "delete": return handleDelete(params, ctx);
		default: return result(`Unknown action: ${action}`, true);
	}
}
