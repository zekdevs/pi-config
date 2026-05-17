# `~/.pi/agent/` — pi.dev Agent Workspace

User-global pi configuration. Agents, prompts, skills, and chains for the `pi` CLI.

## Layout

```
~/.pi/agent/
├── README.md                  this file
├── AGENTS.md                  global instructions injected into every agent
├── settings.json              entry point pi reads (provider, model, packages, agents)
├── agents/                    11 agent definitions (orchestrator + specialists)
├── prompts/                   slash-prompt entry points (e2e, feature, spec)
├── skills/                    domain knowledge bundles (full directories)
├── chains/                    pi-subagents chain definitions (*.chain.md)
└── extensions/
    ├── safety/                blocks dangerous bash patterns at the tool boundary
    ├── quality/               runs ruff/eslint on edited files; surfaces lint as context
    └── rtk-wrap/              (existing user extension)
```

## Chains

Chains are provided by the `pi-subagents` package (installed via `packages` in `settings.json`). Files in `chains/*.chain.md` are auto-discovered. The `{previous}` placeholder is auto-injected between steps.

| Slash command | Chain |
|---|---|
| `/run-chain e2e -- <task>`     | researcher → planner → tester → developer → reviewer → security |
| `/run-chain feature -- <task>` | researcher → tester → developer → reviewer → security |
| `/run-chain spec -- <task>`    | researcher → planner |

Convenience prompt entry points wrap each chain:

- `/e2e <task>`
- `/feature <task>`
- `/spec <task>`

The orchestrator agent is the **caller**, not part of any chain — its only job is dispatching via `/run-chain` (or the `subagent` tool from `pi-subagents`) and summarizing results.

## Invoking an Individual Agent

Run any agent directly without a chain:

```
pi --agent developer
pi --agent researcher
pi --agent architect
```

## Extensions

`settings.json` lists each local extension under `extensions[]` (absolute paths). Pi loads them at startup. Each extension is a small TypeScript module that registers tools, commands, or hooks via side-effect calls on the global `pi` object:

- `pi.registerTool(...)` for tools the model can call
- `pi.registerCommand(...)` for slash commands
- `pi.on(event, handler)` for lifecycle hooks

Registration calls are gated with `typeof pi.X === 'function'` checks so missing methods degrade gracefully.
