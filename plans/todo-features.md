## Run agents beyond your laptops
Run agents in isolated sandboxes on a VM or in the cloud.

## Fuzzy tab/workspace navigator

`hist` already provides a command-history picker. This feature adds an analogous picker for *tabs*: a keybinding (e.g., a dedicated `Ctrl+G` or a `nav` command) opens a fuzzy-searchable list of every open tab — agent, harness, ssh, viewer, reporting — filterable by typing part of its label, with arrow/enter to jump straight to it.

For users running many tabs at once (the common case once profiles and monitors are in play), `Shift+←/→` cycling becomes slow — a navigator turns "which of my twelve tabs was the deploy harness" into a two-keystroke jump. The picker would show each tab's current state indicator (see #1) alongside its label, so blocked/working/done tabs are visually distinguishable in the list itself, not just on the strip.

This is a low-risk, high-frequency-use addition: it reuses the picker UI pattern `hist` already established, just pointed at tabs instead of command history, and composes naturally with #1's state detection to make the navigator double as a triage view.

## Full application color themes

Janissary has `syntax theme` for editor/markdown tabs only. This feature extends theming to the whole application chrome — tab strip, transcript colors, connections/schedule panel backgrounds, borders — via a small set of built-in named themes (dark, light, and a few popular palettes) selectable with `theme <name>`, applied instantly without restart.

Each theme would define a coherent palette (background, foreground, accent/status colors for the state indicators in #1, border colors) rather than individual overridable knobs, keeping the surface simple: pick a theme, get a cohesive look. A `theme` command with no arguments would open a picker modal, mirroring the existing `syntax theme` picker UX so the two theme systems feel consistent to a user who already knows one.

This is a quality-of-life feature rather than a functional one, but it matters for a tool meant to be open for long sessions — matching a user's terminal/editor theme (or simply picking a preferred palette) reduces visual friction, and it's cheap to add given the syntax-theme picker pattern already exists to copy from.

## Agent-facing local API for self-service tab orchestration

Herdr exposes a local Unix socket that lets a running agent create workspaces/panes, split/zoom, spawn helper processes, and read output — letting the agent orchestrate the multiplexer itself, not just be hosted in it. This feature would add an equivalent capability for Janissary's own ACP loop (and potentially harness tabs, via a documented protocol): an agent running inside a tab could issue a small set of safe, allow-listed Janissary commands as part of its tool loop — spawning a new agent tab, sending it a message, opening a schedule — the same way it already can issue `db` and `browser` commands today.

Concretely, this extends the existing ACP tool-loop primer (currently scoped to `db` and `browser`) to also allow a narrow set of Janissary's own built-ins: `agent`, `msg`, `schedule`, `open`. Each would run through the same auto-execute loop already in place, capped at the same step limit, with results fed back to the agent as context — no new transport is needed, since the ACP loop already has a mechanism for "agent proposes a command, host runs it, output comes back."

The functional value is agents that can delegate: an ACP agent working on a large task could spin up a helper agent tab to run tests in parallel, message it, and read the result — turning Janissary from a tool that *hosts* agents into one agents can *use* to coordinate each other, which is a natural extension of the `msg`/`broadcast` primitives that already exist for human-initiated cross-tab coordination.


## notifications for background tab events

Janissary currently has no way to signal the user when something happens in a tab they're not currently viewing — a blocked harness, a finished long-running command, an incoming agent message. This feature adds opt-in notifications: a short sound and/or a transient toast banner fires when a background tab transitions into a state worth noticing (blocked, done, or receives a `msg`/`broadcast`), while the currently focused tab is suppressed from notifying about its own activity.

Notification triggers would be configurable per event type (state transitions from #1, incoming messages, schedule firings) in `.janissary/config.json`, with a global mute toggle and possibly per-tab overrides for noisy tabs a user wants to ignore. The toast would be dismissible and, where the OS supports it, could also register a native OS notification so it's visible even if Janissary's window isn't focused.

This directly addresses the core pain of running many parallel agents: without a signal, a user must poll each tab manually to notice when one needs input, which defeats the purpose of parallelizing work in the first place.






## scheduling of multistep procedures
the goal is to create a way to execute multiple steps in a tab, including in harnesses.
multistep procedures should be stored in a ./procedures directory
each procedure will be a file with a dasherized name stored in markdown format. the steps should be enumerated in a section called steps as a bulleted list of commands to be sent to the tab.

## spin up multiple independent instances of janissary
Create an easy way to launch the janissary in a target directory.
a single server instance will be responsible for interacting with a single UI instance.
when a second instance is launched in a different directory, it will create a new server instance and new UI instance. 
two instances cannot be launched with overlapping file trees.
multiple instance cannot share the same communication channels such as web sockets.

## harness tab transcripts
harness tabs should have a tab transcript that records the harness output.
For example, if claude or opencode are running in the harness, it is expected that the output of their work is captured in the transcript.
  
# deferred

## fix monitoring error 
 saw this error: Already monitoring with persona "assistant".
  monitoring using the same assistant may happen multiple time but for different targets.
  in this case a new monitoring window should be opened

## Agent task queue
task add <agent> <command> enqueues a command to run as soon as the agent becomes non-busy, rather than firing immediately like msg … command. Prevents dropped commands when an agent is mid-turn. Extends the existing per-tab message FIFO with a held-until-idle gating layer.

## agent triggers
- file changes
- transcript triggers

