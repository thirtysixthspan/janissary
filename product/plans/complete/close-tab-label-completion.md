# Tab-label completion for `close`/`exit`

**Complexity: 2/10** — extends an existing, well-tested completion handler with two more matching command names; no new data flow or state.

## Goal

`close <name>` (and its `exit` alias) closes the tab whose label matches `<name>`, but typing that name at the command line does not tab-complete against open tab labels the way `send <name>` and `queue <name>` already do. Typing `close ja<TAB>` should complete to `close janus ` the same way `send ja<TAB>` completes to `send janus `.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Tab-label completion for `send`/`queue` at argument 1 | `src/completion/handlers.ts:24` (`completeSendTarget`) |
| Wiring into the completion chain | `src/completion/index.ts:42` |
| Unit tests for the handler | `src/completion/handlers.test.ts:12` |
| Caller supplying the tab-label list | `src/controller.ts:216` (`agents = this.managers.tab.allLabels()`) |
| `close`/`exit` command parsing (target arg is the tab name) | `src/commands/close.ts` (`parseClose`) |

`completeSendTarget` already special-cases two command names (`send`, `queue`) sharing one argument-1-completes-against-tab-labels rule. `close`/`exit` fit the exact same shape, so this is a one-line condition change plus doc/test updates — no new function, no new wiring in `index.ts` (the handler is already invoked unconditionally for every command in the chain).

## Approach

Add `close` and `exit` to the command check in `completeSendTarget` so argument 1 of those commands also completes against open tab labels. Keep the function name as-is (it already covers `queue` despite its name, so this follows existing precedent rather than introducing a rename that touches unrelated call sites).

## Implementation steps

1. **`src/completion/handlers.ts`** — in `completeSendTarget`, change the guard from:
   ```ts
   if (argumentIndex !== 1 || (command !== 'send' && command !== 'queue')) return null;
   ```
   to:
   ```ts
   if (argumentIndex !== 1 || !['send', 'queue', 'close', 'exit'].includes(command)) return null;
   ```
2. Update the function's usage doc comment in `src/completion/index.ts` (the block above `completeCommandLine`) to mention `close`/`exit` alongside `send`/`queue` as commands whose target argument completes against tab labels.

## Tests

Add to `src/completion/handlers.test.ts`, in the existing `describe('completeSendTarget', …)` block (mirroring the existing `send`/`queue` cases):

- `completes a tab label for the close command at argument 1` — `completeSendTarget('close', 1, 'jan', ['janus', 'claude'], 'close jan', '', 6)` → `newInput` is `'close janus '`.
- `completes a tab label for the exit command at argument 1` — `completeSendTarget('exit', 1, 'jan', ['janus', 'claude'], 'exit jan', '', 5)` → `newInput` is `'exit janus '`.

## Verification

- `./scripts/run.mjs check-diff` — lints changed files, typechecks incrementally, runs the affected server tests.
- Manual: not practical to drive interactively in this environment (no running app), but behavior is fully covered by the unit tests above, which exercise the same code path `controller.ts` calls into.

## Out of scope

- Completing `close page <n>`'s numeric argument, or offering `page` itself as a completion candidate — the issue is about tab **labels**, not the page-number or `page` sub-form.
- Making `close`/`send`/`queue` resolve against a tab's display alias (`title`) in addition to its label — that's a separate lookup concern (see `resolve-target.ts`), not a completion concern, and isn't part of this issue.
