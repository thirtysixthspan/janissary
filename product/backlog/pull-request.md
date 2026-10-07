<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Bring two spec passages in line with this pull request: the send/queue/schedule target rule in the shell-tab spec, and the docs-screenshot reset's typed command.

Existing Issue: `product/specs/shell-tab.md` still says `send`, `queue` and `schedule` accept a plugin tab "by one rule" and "share that check so they cannot disagree", then says straight after that `send` and `queue` accept a provisioning shell that `schedule` refuses. Separately, `product/specs/docs-screenshots.md` still says the reset recreates the root shell "by typing `zsh`", while the script now types `zsh --no-workspace` precisely because a bare `zsh` would clone. Severity: 2/10

Existing Risk: 2/10 - A later change that reads the spec literally could re-unify the three targets and silently re-break queueing into a provisioning shell, or "simplify" the reset back to a bare `zsh` that provisions a clone before every screenshot.

Proposal Risk: 1/10 - Spec prose only, and the reset test in `scripts/docs-screenshots/reset.test.mjs` already pins the typed command, so a wrong edit here cannot change behavior.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1569: reconcile the shell-tab target rule and docs-screenshot reset wording with the code". In `product/specs/shell-tab.md`, in the paragraph about `send`, `queue` and `schedule` targets, replace the "one rule … cannot disagree" framing with the real rule. All three accept a plugin tab that owns a live terminal (`ownsTerminal` in `src/tab/plugin-terminals.ts`). `send` and `queue` additionally accept one whose clone is still provisioning (`awaitsTerminal` beside it). `schedule` deliberately does not, because it types into a terminal that must already exist. Keep the refusal messages that follow exactly as written. In `product/specs/docs-screenshots.md`, change "The run recreates it by typing `zsh`" to say it types `zsh --no-workspace`, add half a sentence explaining that a bare `zsh` would provision a workspace clone, and check whether the `tabs-overview` description anywhere in that spec names the bare command. Edit only these spec files. `src/commands/send.ts`, `src/commands/queue.ts`, `src/schedule/targets.ts` and `scripts/docs-screenshots/reset.mjs` already match the corrected wording.
