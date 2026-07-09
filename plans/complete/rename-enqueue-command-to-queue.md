# Rename the `enqueue` command to `queue`

**Complexity: 5/10** — small diff, but required resolving a real naming collision (both `enqueue`
and `queue` were live commands with unrelated behavior) rather than a pure find-and-replace.

## Goal

`enqueue <agent> <command...>` (append a command to another agent's queue) is renamed to
`queue <agent> <command...>`, matching the small-issue's request that "the command enqueue should
be switched to queue." Bare `queue` keeps its existing meaning (opens the interactive queue-picker
popup; a no-op on the server, since the client intercepts it).

## Design decisions

**Not a plain rename — `queue` was already a distinct command.** `src/commands/queue.ts` already
existed as a no-op stub matching the exact string `"queue"` (the interactive picker, Ctrl+E, is
handled entirely client-side; the server-side stub only exists so a non-interactive dispatch of
bare `queue`, e.g. from a schedule, doesn't error). Simply changing `enqueue.ts`'s match pattern to
`queue` would have created two command entries both matching input starting with "queue" — since
command dispatch (`src/resolve.ts`) takes the first array match, whichever came first in
`src/commands/index.ts` would silently win, permanently shadowing the other for any overlapping
input. The two behaviors had to be merged into one command definition that branches on whether
there's a target argument.

**Internal method names are untouched.** `TabManager.enqueue(label, text)` is the generic
"append this text to a tab's queue" primitive — used by the new `queue <agent> <command>` command,
but *also* used internally by `CommandManager.dispatchOrRun` for the unrelated "tab is busy, so
queue whatever was just typed on its own command line" mechanism. That method name is not
user-facing and renaming it would touch ~15 unrelated call sites in `tab-manager.test.ts`,
`command-manager.test.ts`, and `controller.test.ts` for zero user-visible benefit — out of scope.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The no-op bare-`queue` stub being merged into | `src/commands/queue.ts` |
| The enqueue-to-another-tab logic being moved in | `src/commands/enqueue.ts` (deleted) |
| Command dispatch / first-match-wins order | `src/resolve.ts`, `src/commands/index.ts` |
| `TabManager.enqueue()` primitive (reused, not renamed) | `src/tab-manager.ts` |
| Tab-completion for the target-agent argument | `src/completion-handlers.ts` (`completeSendTarget`) |

## Server changes

1. **`src/commands/queue.ts`** — merged: `match` becomes `/^queue\b/i` (was an exact `"queue"`
   match). `run` first checks for the bare form (`/^queue\s*$/i`) and no-ops exactly as before;
   otherwise it parses `queue <agent> <command...>` (moved from `enqueue.ts`'s `parseEnqueueCommand`,
   renamed `parseQueueCommand`) and performs the same lookup/dispatch/error messages as the old
   `enqueue` command, unchanged in behavior.
2. **`src/commands/enqueue.ts`** — deleted.
3. **`src/commands/index.ts`** — removed the `enqueue` import/entry; `queue` now covers both cases.
4. **`src/completion-handlers.ts`** — `completeSendTarget`'s command-name check changed from
   `'enqueue'` to `'queue'`, so `Tab` still completes the target-agent argument.

## Tests

- **`src/commands/queue.test.ts`** — merged `enqueue.test.ts`'s cases in (renamed command text
  throughout) alongside the existing bare-`queue` cases: matches bare/with-args, does not match
  `queued`, bare `queue` is a no-op, `parseQueueCommand`'s error/parse cases, and the full run
  path (unknown target, non-agent target, successful enqueue+drain+confirm, alias resolution).
- **`src/commands/enqueue.test.ts`** — deleted (folded into the above).
- **`src/completion-handlers.test.ts`** — the "completes a tab label for the enqueue command"
  case updated to exercise `'queue'` instead.

## Spec / docs changes

- **`specs/agent-command-queue.md`** — renamed the `### \`enqueue\` command` section to
  `### \`queue <agent> <command>\` command`, added a line distinguishing it from bare `queue`
  (the picker), and updated the "What never queues" bullet to clarify that only the argument-less
  form is client-intercepted.
- **`public-documentation/command-bar/queue.md`** — updated the `enqueue` mentions and example to
  `queue`.

## Verification

- `./scripts/run.mjs check-diff` — lint, incremental typecheck, and the related server tests.
- Manual (not run in this environment): type `queue` alone — the interactive picker still opens
  client-side. Type `queue <agent> <command>` targeting a busy and an idle agent tab — confirm the
  same enqueue/immediate-run/error behavior as the old `enqueue` command.

## Out of scope

- `TabManager.enqueue()` and any other internal "enqueue" naming unrelated to the typed command.
- Adding `queue`/its keybinding to `help.md` — tracked as its own separate small-issue entry.
