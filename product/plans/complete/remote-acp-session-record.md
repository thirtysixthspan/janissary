# Remote ACP session records

## Goal

Represent each remote ACP session id with one explicit lifecycle record rather than coordinated membership across four maps.

## Design

`RemoteAcp` will own one `Map<string, RemoteAcpRecord>` with `live`, `closing`, and `settled` variants. A live record carries its session and `runOnly`; a closing record carries its session and shared shutdown promise; a settled record carries the shutdown outcome and retains the session only when shutdown failed, so `dispose()` can retry an unreleased process.

`prompt` accepts only live records. `close` shares an in-flight shutdown and transitions to a settled outcome, preserving repeat-close acknowledgments. `detachRuns` transitions run-only sessions into closing records. Disposal shuts down live, closing, and unreleased settled records, while preserving the current repeated-dispose behavior.

Keep `stopSession`, wire frame shapes, and callback behavior unchanged. In particular, connection callbacks continue to send frames by id even after the record leaves the live state, so late callbacks are not suppressed.

## Verification

Use `src/remote/serve-acp.test.ts` to cover open, prompt, close, concurrent/shared shutdown, dispose, and detach behavior, including exact prompt errors and repeat-close outcomes. Add coverage that a late callback after close still emits its frame. Run `./scripts/run.mjs check-diff`.

This is an internal representation change; it does not change user-facing behavior, so the ACP spec and user documentation need no edits.
