# Agent guidance

### Canonical instructions

`AGENTS.md` is the repository’s canonical instruction file for coding agents. It states the project structure, implementation constraints, verification workflow, package-safety gate, plan storage, script runner, and commit conventions. Agent-facing task prompts and guidance link to this file when they need repository-wide instructions.

### Claude Code compatibility

`CLAUDE.md` contains exactly `@AGENTS.md`. Claude Code therefore receives the same instructions without maintaining a second copy that could drift from the canonical guide.

### Skills

A skill is a directory under `skills/` whose `SKILL.md` carries a `name` matching the directory and a `description` saying what it does and when to reach for it. The harness running in a tab finds them there; nothing in the application loads, validates, or executes a skill itself, and a skill adds no command surface of its own.

`skills/delegate-to-agents` teaches an agent to hand work to other agents: opening a worker with `agent <name> --model <model-id>`, blocking on an answer with `msg <worker> request acp "<task>"`, handing a task over without waiting with `send`, and polling a worker's transcript with `msg <worker> request state`. It documents the bounds delegation carries — the depth cap, the reach limited to the agent's own group and three commands, and the screening a worker's answer goes through — all of which are behavior of the ACP tool loop itself rather than of the skill — see [[acp]].
