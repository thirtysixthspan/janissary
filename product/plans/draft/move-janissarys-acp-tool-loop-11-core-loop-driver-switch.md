# ACP tool loop 11 — the core loop runs through the shared driver

**Complexity: 4/10** — ~35 added lines in 2 files, 7 requirements, 5 scenarios (p=4.95)

Run order: 11 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` (the local half of "Local side: one entry point for both session kinds", its "handlers … moved unchanged" paragraph; decisions 1, 6, 7, and 9, local core halves). Depends on subplan 10 (`move-janissarys-acp-tool-loop-10-loop-driver-module.md`). Subplan 23 adds the remote branch behind the same call.

`runCorePrompt` still drives `runAcpToolLoop` itself, with the gate-and-route runner subplan 8 wrote. This subplan replaces that with one call to `runToolLoop`. `runCorePrompt` keeps only what is local by nature: the snapshot it builds, a host made of its caller and workspace runners, and the transcript, notification, record, and settle handlers. Behavior on every tab stays exactly as it was after subplan 8.

## Design decisions

- **One call.** `runCorePrompt` builds the snapshot as in subplan 8 and calls `runToolLoop(session, prompt, snapshot, host, events, signal)`. Its direct `runAcpToolLoop` call, its primer assembly, and its runner go away.
- **Host.**
  - `runCaller` is `dispatchNative`, and `runWorkspace` is `readFileInTab`.
  - Both throw `ACP: prompt cancelled.` when the prompt is no longer active, as `runCommand` does today.
- **Handlers move unchanged in behavior** (source decision 7):
  - `startCommand` calls `recordTool(command)`.
  - `ranCommand` calls `recordTool(result)` and appends the `acp: true` entry. When `refused` is `'disabled'` it raises `notify(managers, 'command-disabled', label, result)`, which subplan 8 raised inside its runner (source decision 6).
  - `finished` keeps the `(stopped after <maxSteps> tool steps)` paragraph, with `maxSteps` the driver's.
  - `startTurn`, `chunk`, `endTurn`, and `error` are as today.
- **Guard.** `guardAcpHandlers` (`src/acp/guard-handlers.ts`) passes `startCommand` and the extra `ranCommand` arguments through under its `active` check. The `active()` guard on provider callbacks stays in `runCorePrompt`, which wraps the local session before handing it to `runToolLoop`, as it wraps it for `runAcpToolLoop` today.
- **Cancellation** (source decision 9, local core half). A reset mid-run settles the prompt at once. The guarded events drop anything that arrives after the prompt stops being active. The driver drops a late host result.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Driver and entry point | `runToolLoop`, `CORE_MAX_STEPS` in `src/acp/drive-loop.ts` (subplan 10) |
| Today's handlers, host functions, and session guard | `runCorePrompt` in `src/acp/run-prompt.ts` |
| Event guard | `guardAcpHandlers` in `src/acp/guard-handlers.ts` |

## Proposed changes

- `src/acp/run-prompt.ts`: call `runToolLoop` with the snapshot, the host, and the moved handlers.
- `src/acp/guard-handlers.ts`: pass the new event and arguments through.

## Tests

`src/acp/run-prompt.test.ts`:
- the existing local-path cases still pass unchanged: the same transcript entries, records, notifications, and settled replies;
- eight steps end with the `(stopped after 8 tool steps)` paragraph;
- a disabled refusal arriving through `ranCommand` raises `command-disabled`;
- a reset while a caller tool is pending settles the prompt and records no further step.

## Out of scope

Agent runs (subplans 12 and 13). The remote branch and host tags (subplans 23 and 24).

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then, by hand, on a local tab:
- `ask` and `tell` with `db`, `browser`, `question`, and `file read` steps behave exactly as after subplan 8;
- `tell reset` mid-run settles at once with no further step.
