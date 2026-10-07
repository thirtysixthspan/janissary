# Reconcile the shell-tab target rule and docs-screenshot reset wording with the code

**Complexity: 1/10** — spec prose only, in two files. The behavior both passages describe already ships in this pull request and is already pinned by tests, so the only risk is a wording that misstates it.

Two spec passages contradict the code this pull request ships:

- `product/specs/shell-tab.md` says `send`, `queue` and `schedule` accept a plugin tab "by one rule" and "share that check so they cannot disagree", then says straight after that `send` and `queue` accept a provisioning shell that `schedule` refuses. In the code, `src/commands/send.ts` and `src/commands/queue.ts` accept `ownsTerminal(...) || awaitsTerminal(...)`, while `src/schedule/targets.ts` accepts `ownsTerminal(...)` alone.
- `product/specs/docs-screenshots.md` says the reset recreates the root shell "by typing `zsh`", while `scripts/docs-screenshots/reset.mjs` types `zsh --no-workspace`, because a bare `zsh` now provisions a workspace clone.

## Goal

Both specs state the rule the code follows, so a later change that reads them literally cannot re-unify the three targets or "simplify" the reset back to a bare `zsh`.

## Approach

1. In `product/specs/shell-tab.md`, replace the "one rule … cannot disagree" framing: all three commands accept a plugin tab that owns a live terminal (`ownsTerminal`); `send` and `queue` additionally accept one whose clone is still provisioning (`awaitsTerminal`); `schedule` deliberately does not, because it types into a terminal that must already exist. Keep the refusal messages that follow exactly as written.
2. In `product/specs/docs-screenshots.md`, say the reset types `zsh --no-workspace`, with half a sentence on why a bare `zsh` would provision a workspace clone. The spec has no `tabs-overview` description naming the bare command, so nothing else there changes.

## Tests

No new tests: behavior does not change, and existing tests already pin it — `src/commands/send.test.ts` and `src/commands/queue.test.ts` cover the provisioning shell, `src/commands/schedule.test.ts` ("refuses a plugin tab whose workspace clone is still provisioning") covers the refusal, and `scripts/docs-screenshots/reset.test.mjs` asserts the typed `zsh --no-workspace`.

## Out of scope

- Any change to `src/commands/send.ts`, `src/commands/queue.ts`, `src/schedule/targets.ts` or `scripts/docs-screenshots/reset.mjs`, which already match the corrected wording.
