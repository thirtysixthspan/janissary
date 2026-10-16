# System schedules 06: shell queue provenance round trip

**Complexity: 5/10**

The work is the shell adapter's receipt lifetime and terminal-readiness/error races. It consumes 05's server contract while retaining the existing framework-free FIFO and shell routing.

## Goal

Connect the server queue-receipt contract to the existing retained shell FIFO, preserving normal shell routing, error continuation, and idle waits. Source: `product/plans/ready/add-system-schedules.md`.

## Decisions and dependencies

- Dependencies: 03 (hidden shell mount/recovery) and 05 (server receipt capabilities).
- Keep the framework-free `CommandQueue` service and its public string transport/runner contract unchanged. The shell adapter captures the receipt for the one dequeued line and passes it to that line's runner. Consume/clear the adapter slot before awaiting execution; a later typed submission cannot borrow it. This is local adapter state, never a global origin flag or text-matching map.
- Add shell intents for structured dequeue, queued dispatch, and discard, while retaining the old string `dispatch` and `dequeue` forms. Request the two added capabilities statically. Validate intent envelopes in the shared shell contract, rejecting bad requests without disabling the plugin.
- The queued dispatch intent takes only the receipt, not a client-chosen line or origin. Shell routing remains shell-first for `!` and bare `clear`, then the same application interception and registry dispatch. A `finally` discard releases receipts after shell-only lines, ignored hidden picker words, application completion, transport error, and disposal; discarding an already consumed receipt is an idempotent no-op owned by that tab.
- Shell output/errors use the existing terminal/recording/transcript paths. `false` and ordinary application errors do not cancel the drain or create notices. A shell line waits for zsh idle; an editor/foreground program holds it indefinitely. A queued `close system` hides and continues because 01 preserves the mount/resources.
- Queue readiness includes a completed terminal attachment, not just `commandRunning: false`. `useShellTerminal.write` currently drops data while its handle is absent; a newly mounted/replaced hidden consumer must not dequeue until its attachment is ready. Resume from authoritative busy state/idle markers without typing setup commands or assuming a missed startup prompt will be replayed.
- `active: false` prevents all unseen picker variants, including the shell-local `hist` path currently checked before app interception. Do not drop shell marker processing when inactive.

## Existing code to reuse

`web/src/shared/command-queue/{command-queue,useCommandQueue}.ts`, `web/src/plugins/shell/{useShellCommandQueue,useShellSubmit,useShellTerminal,command-line-rules}.ts`, and the shell's guarded intent table. `CommandQueue.wake()` already handles externally appended rows. `useShellTerminal` attaches while display-hidden because the container is still mounted.

## File scope

- `src/plugins/shell/{activate,shared,manifest}.ts`; anticipated server extract `src/plugins/shell/queue-intents.ts`. Keep wire guards/types in import-free `shared.ts`; do not introduce an imported `queue-shared.ts` helper into that browser-executed contract. `src/plugins/line-capabilities.ts` or 05's `queue-capabilities.ts` only for final contract integration.
- `web/src/plugins/shell/ShellTab.tsx`, `web/src/plugins/shell/{useShellCommandQueue,useShellSubmit,useShellTerminal,useShellTabTerminal}.ts`; new `web/src/plugins/shell/queued-command-adapter.ts`; `web/src/shared/command-queue/useCommandQueue.test.tsx` and service tests for regression only. Production core FIFO changes are not expected.
- Tests: new `web/src/plugins/shell/{queued-command-adapter.test.ts,useShellCommandQueue.test.tsx,useShellSubmit.test.tsx}`, existing `ShellTab.test.tsx`, `useShellTerminal.test.ts`, new hidden-consumer integration test beside them; `src/plugins/shell/{activate,shared}.test.ts`, `src/plugins/shell-capabilities.test.ts`, capability contract tests and registry schema tests if needed.
- Specs/docs: `product/specs/{command-queue,shell-tab,tab-plugins}.md`, `documentation/developer-documentation/tab-plugins.md` for intent examples. If only additive intent-result fields are added, keep payload schema unchanged; if payload shape changes, update manifest/registry literals and schema agreement tests together.

## Ordered changes

1. Add validated structured queue intents over the declared 05 capabilities; retain legacy intent compatibility.
2. Implement the framework-free single-drain adapter and thin hook integration. Thread the receipt as a per-run argument through `useShellSubmit`, consume exactly once, and release in all non-dispatch paths.
3. Gate shell-local picker handling on active visibility, preserve ordinary typed history and global-history distinctions, wait for terminal-attachment readiness before draining, and ensure release/cleanup on unmount/terminal replacement.
4. Test hidden operation, error continuation and mixed provenance; update specs and contract reference.

## Tests and verification

Test identical text from different origins, ordinary queued/manual submissions interleaved with schedule rows, all dispatch/shell/intercept/error/disposal receipt outcomes, one-time consume, hidden `hist`/tasks/nav/theme/queue behavior, externally queued wakeups, queued work arriving before attachment, delayed/refused attachment, replacement-terminal readiness, application error followed by another line, shell `false` followed by another line, and pause until prompt/foreground exit. Check the active tab never changes merely because a hidden consumer drains. Scope tests enqueue 05's structured rows directly; they do not require 08's future scheduler. Restart tests in 13 assert fresh queues rather than resumed adapter receipts.

Run `./scripts/run.mjs check-diff`. Scope E2E combines the real shell plugin intents, server queue storage and retained client consumer around a real zsh in a scratch instance: append `pwd`, `false`, and a deliberately authored `notify after-false` while system is hidden; verify the later line runs, the shell transcript has the shell output, and no automatic failed-line notification exists. Include a busy foreground command and reveal/hide while it runs. Rebuild with `npm run build:web` and inspect lazy shell chunk boundaries if registry/shared client imports changed. Final browser repeatability is owned by 13.

## Boundaries

No scheduler owner or harness suffix policy. The core queue algorithm stays the same; no shadow FIFO, server drain, timeout, stop-on-error, or status-code interpretation is added.
