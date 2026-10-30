# Tab names

Use `shell` to open a shell with an unused name, or supply your own:

```
shell
shell bilal --no-workspace
harness claude as build
```

<img class="agent-float" src="/agents/bilal-south-west.png" alt="" />

Shell tabs draw a random unused name from a pool of 50 bundled names, such as `bilal` and `selim`. A project can replace that pool with `.janissary/agent-names.json`, a JSON array of names. Names are lowercased, and each may hold only letters, digits, `_`, `.`, and `-`, so it works as a single workspace folder. The file is read once at startup, so restart after you change it. If the file can't be used, Janissary prints a warning in the terminal you launched it from and keeps the bundled pool. The [harness guide](/user-documentation/advanced-agents/harness#choosing-a-model-and-effort-level) shows both warnings.

Harness tabs use their tool name and a numeric suffix unless you supply a name with `as`. A name must be free among open tabs, Sessions rows that can still return, and running workspaces when the launch creates one. Names compare without regard to case. A name you typed that clashes posts `Cannot launch "<name>": …` in Notifications and opens nothing. A name Janissary picks for you skips anything in use. The one exception is a `harness` line in a [system-scheduled runscript](/user-documentation/automation/scheduling), which takes the next free number instead of being refused.

An unnamed shell uses the same pool and skips names held by open tabs, Sessions rows that can still return, and running workspaces when the shell gets a workspace. When every pool name is in use, it tries `shell`, then `shell-2`, `shell-3`, and so on. This fallback does not post a refusal to Notifications.

A leftover workspace with nothing running in it is cleared before a fresh clone starts. See [Workspaced tabs](/user-documentation/advanced-agents/workspaced-agent) for workspace lifetime and [Remote shells and harnesses](/user-documentation/advanced-agents/remote-agents) for remote launch checks.

A [display alias](/user-documentation/getting-started/tabs#renaming-a-tab) changes what the strip shows while preserving the label used by commands such as `send`.
