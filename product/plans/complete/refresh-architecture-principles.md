# Refresh architecture principles 3 and 7

**Complexity: 3/10** — a documentation-only rewrite of two sections in one guideline file. No source code changes, no behavior changes; the work is verifying the current shape of the code and restating the two principles against it.

## Goal

Make `ai/guidelines/architecture-principles.md` describe the codebase as it is today. Principles 3 and 7 currently instruct contributors to solve problems that are already solved:

- Principle 3 says `controller.ts` is "~1130 lines and violates the project's own 200-line guideline by 5×" and calls it a God Object holding shell I/O, PTY management, ACP loops, browser glue, scheduling, messaging, globbing, file serving, and persistence. `src/controller.ts` is now 242 lines of pure delegation — every method forwards to a manager or a feature module.
- Principle 7 says `src/protocol.ts` and `web/src/protocol.ts` are hand-mirrored files that must be updated in the same commit. `web/src/protocol.ts` no longer exists; the web app imports the single definition in `src/protocol.ts` through the `@shared` path alias.

Principle 10 in the same document calls stale architecture docs bugs to fix on sight, and the document is declared binding for both humans and AI agents, so the drift actively misdirects work.

## Approach

Rewrite the body of principles 3 and 7 to state the current structure, keep each principle's **Rule** intact in intent, and redirect the "remaining pressure" note in each to where the tension actually sits now:

- For principle 3, the pressure moved from `controller.ts` into `src/tab/manager.ts`, the only non-test source file that exceeds the 200-line guideline and the only file in the repo carrying an `/* eslint-disable max-lines */` suppression.
- For principle 7, the pressure moved from keeping two files in sync to keeping the alias wired in the three configs that declare it (`web/tsconfig.json`, `web/vite.config.ts`, `vitest.config.ts`) and to not re-declaring a wire shape locally on the client.

Also update the one clause in the closing "How to use these" section that repeats principle 7's retired mirroring rule ("edited one `protocol.ts` but not the other"), so the document does not reintroduce the stale claim two paragraphs after correcting it, and delete the stray `</content>` tag left on the file's last line.

## Implementation steps

1. Rewrite principle 3's body to describe `src/controller.ts` as a delegating dispatcher, name `src/tab/manager.ts` as the file where the 200-line pressure now sits, and keep the rule that feature logic lives in feature modules and files stay at or under 200 lines.
2. Rewrite principle 7's body to describe `src/protocol.ts` as the single wire contract that the web app imports through the `@shared` alias, name the three configs that declare that alias, and restate the rule as "one definition, imported — never re-declared", covering the runtime-vs-type-only import distinction the vitest config depends on.
3. Update the developer checklist bullet in "How to use these" to replace the two-`protocol.ts` clause with the current failure mode, and remove the trailing `</content>` line.

## Tests

None. This change touches only a guideline document; it alters no source, no behavior, and no user-visible surface, so there is nothing for the suite to pin. `./scripts/run.mjs check-diff` still runs to confirm the working tree stays green.

## Out of scope

- Splitting `src/tab/manager.ts` or removing its `max-lines` suppression — that is its own backlog item, and this change only points at it.
- Rewriting principles 1, 2, 4, 5, 6, 8, 9, or 10.
- Editing `CLAUDE.md`, the other files in `ai/guidelines/`, or any functional spec.
