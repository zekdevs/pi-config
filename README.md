# `~/.pi/agent/` — pi.dev Agent Workspace

User-global pi configuration. Agents, prompts, skills, and chains for the `pi` CLI.

## Layout

```
~/.pi/agent/
├── README.md                  this file
├── APPEND_SYSTEM.md           add to system prompt
├── settings.json              entry point pi reads (provider, model, packages, agents)
├── agents/                    11 agent definitions (orchestrator + specialists)
├── prompts/                   slash-prompt entry points (e2e, feature, spec)
├── skills/                    domain knowledge bundles (full directories)
└── extensions/
    ├── safety/                blocks dangerous bash patterns at the tool boundary
    ├── quality/               runs ruff/eslint on edited files; surfaces lint as context
    └── rtk-wrap/              (existing user extension)
```


## Invoking an Individual Agent

Run any agent directly without a chain:

```
pi --agent researcher
pi --agent architect
```

## Extensions

`settings.json` lists each local extension under `extensions[]` (absolute paths). Pi loads them at startup. Each extension is a small TypeScript module that registers tools, commands, or hooks via side-effect calls on the global `pi` object:

- `pi.registerTool(...)` for tools the model can call
- `pi.registerCommand(...)` for slash commands
- `pi.on(event, handler)` for lifecycle hooks

Registration calls are gated with `typeof pi.X === 'function'` checks so missing methods degrade gracefully.
