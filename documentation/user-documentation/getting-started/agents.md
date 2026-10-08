# Tab names

Use `zsh` to open a shell with an unused name, or supply your own:

```
zsh
zsh bilal --no-workspace
harness claude as build
```

<img class="agent-float" src="/agents/bilal-south-west.png" alt="" />

Shell tabs draw from the project's name pool. A project can replace the bundled list with `.janissary/agent-names.json`, a JSON array of names. Names are lowercased and must be safe as a single workspace folder. Harness tabs use their tool name and a numeric suffix unless you supply a name with `as`.

A name must be free among open tabs, live or detached Sessions rows, and running workspaces. An explicit clash posts `Cannot launch "<name>": …` in Notifications. An unnamed launch tries the next available name. If the pool is exhausted, Notifications shows `All agent names are in use.`

A leftover workspace with nothing running in it is cleared before a fresh clone starts. See [Workspaced tabs](/user-documentation/advanced-agents/workspaced-agent) for workspace lifetime and [Remote shells and harnesses](/user-documentation/advanced-agents/remote-agents) for remote launch checks.

A [display alias](/user-documentation/getting-started/tabs#renaming-a-tab) changes what the strip shows while preserving the label used by commands such as `send`.
