### harness

Launch `claude`, `opencode`, or `codex` with optional settings. Workspace, browser, and auto-approval are enabled by default; auto-resume is enabled by default for `opencode` and `codex`. All three harnesses support `-y`/`--yes`, while only `opencode` and `codex` support `--auto-resume`. Launch clauses can appear in any order, but `with <prompt>` comes last. Bare `harness` opens the New harness dialog from a tab with a command line.

**Usage**

`harness`

`harness <claude|opencode|codex> [as <label>] [on <address>] [in group <name|id>] [-w|--workspace|--no-workspace] [--offline] [-y|--yes] [--no-auto-approve] [-b|--browser|--no-browser] [--auto-resume|--no-auto-resume] [--model <name>] [--effort <level>] [with <prompt>]`

`harness capture <name>`

`harness transcript <name>`

**Use cases**

- Start a named harness in a new tab, with a disposable workspace by default.
- Launch on another host, choose a group or model, or change workspace, network, browser, and approval settings.
- Capture a harness tab's current screen or open its session transcript.

**Examples**

- `harness` opens the New harness dialog.
- `harness claude --no-workspace --no-auto-approve` starts Claude Code in the current project without automatic approval.
- `harness codex as reviewer on devbox in group Review --offline --no-browser -y --model gpt-5 --effort high with inspect the failing tests` starts Codex on `devbox` with the named settings and prompt.
- `harness capture reviewer` opens a screen capture from the harness tab labeled `reviewer`.
- `harness transcript reviewer` opens the session transcript from the harness tab labeled `reviewer`.
