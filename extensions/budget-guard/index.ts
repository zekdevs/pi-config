import type {
  BeforeAgentStartEvent,
  BeforeAgentStartEventResult,
  ExtensionAPI,
  SessionShutdownEvent,
  ToolCallEvent,
  ToolResultEvent,
  ToolResultEventResult,
} from "@earendil-works/pi-coding-agent";
import { getAgentDir, parseFrontmatter } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";

const HARD_CAP = 100;
const WARN_THRESHOLDS = [50, 80, 95] as const;

const AGENT_NAME = process.env.PI_SUBAGENT_CHILD_AGENT ?? "";
const RUN_ID =
  process.env.PI_SUBAGENT_RUN_ID ??
  (AGENT_NAME ? `${AGENT_NAME}-${process.pid}` : `${process.pid}`);
const IS_SUBAGENT = AGENT_NAME.length > 0;

interface AgentFrontmatter extends Record<string, unknown> {
  budgetGuard?: boolean;
}

function isEnabledForAgent(): boolean {
  if (!IS_SUBAGENT) return false;
  const agentFile = path.join(getAgentDir(), "agents", `${AGENT_NAME}.md`);
  try {
    const raw = fs.readFileSync(agentFile, "utf8");
    const { frontmatter } = parseFrontmatter<AgentFrontmatter>(raw);
    const v = frontmatter?.budgetGuard as unknown;
    return v === true || v === "true";
  } catch {
    return false;
  }
}

const counts = new Map<string, number>();
const warned = new Map<string, Set<number>>();

function getCount(): number {
  return counts.get(RUN_ID) ?? 0;
}

function bumpCount(): number {
  const next = getCount() + 1;
  counts.set(RUN_ID, next);
  return next;
}

function nextWarningCrossed(prev: number, current: number): number | undefined {
  for (const t of WARN_THRESHOLDS) {
    if (prev < t && current >= t) {
      const seen = warned.get(RUN_ID) ?? new Set<number>();
      if (seen.has(t)) continue;
      seen.add(t);
      warned.set(RUN_ID, seen);
      return t;
    }
  }
  return undefined;
}

const SYSTEM_PROMPT_ADDENDUM = [
  "",
  "## Tool Budget",
  "",
  `You have a hard cap of ${HARD_CAP} tool calls.`,
  "Plan to investigate efficiently and return a concrete deliverable before exhausting the budget.",
  "If you approach the cap, summarize what you have and stop rather than burning calls on speculative work.",
  `You will receive inline warnings at ${WARN_THRESHOLDS.join(", ")} tool calls. After the ${HARD_CAP}th tool call, the rest will be blocked.`,
  "",
].join("\n");

export default function (pi: ExtensionAPI) {
  if (!isEnabledForAgent()) return;

  pi.on(
    "before_agent_start",
    (event: BeforeAgentStartEvent): BeforeAgentStartEventResult | undefined => {
      return { systemPrompt: `${event.systemPrompt}${SYSTEM_PROMPT_ADDENDUM}` };
    },
  );

  pi.on("tool_call", (event: ToolCallEvent): { block: true; reason: string } | undefined => {
    void event;
    const current = getCount();
    if (current >= HARD_CAP) {
      return {
        block: true,
        reason:
          `budget-guard: subagent "${AGENT_NAME}" reached the hard cap of ${HARD_CAP} tool calls. ` +
          `Stop calling tools. Summarize what you have found and accomplished so far, then return control to the orchestrator.`,
      };
    }
    bumpCount();
    return undefined;
  });

  pi.on("tool_result", (event: ToolResultEvent): ToolResultEventResult | undefined => {
    const current = getCount();
    const crossed = nextWarningCrossed(current - 1, current);
    if (crossed === undefined) return undefined;
    const remaining = HARD_CAP - current;
    const notice = {
      type: "text" as const,
      text:
        `[budget-guard] ${current}/${HARD_CAP} tool calls used (${remaining} remaining). ` +
        (remaining <= 5
          ? "Stop now: summarize findings and return."
          : remaining <= 20
            ? "Wrap up soon: prioritize finalizing your deliverable."
            : "Pace yourself: avoid speculative tool use."),
    };
    const baseContent = Array.isArray(event.content) ? event.content : [];
    return { content: [...baseContent, notice] };
  });

  pi.on("session_shutdown", (_event: SessionShutdownEvent) => {
    counts.delete(RUN_ID);
    warned.delete(RUN_ID);
  });
}
