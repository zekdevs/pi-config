

My pi agent config

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
    ├── budget-guard/          limits subagent scope
    ├── pi-hashline/           hashline read & edit inspired by omp
    ├── pi-web-access/         basic web tools
    ├── subagent/              basic subagent support
    ├── todo/                  tasks tools
    └── rtk-wrap/              proxy cli bash calls
```


## Invoking an Individual Agent

Run any agent directly without a chain:

```
pi --agent researcher
pi --agent architect
```

- `pi.registerCommand(...)` for slash commands
- `pi.on(event, handler)` for lifecycle hooks

Registration calls are gated with `typeof pi.X === 'function'` checks so missing methods degrade gracefully.
