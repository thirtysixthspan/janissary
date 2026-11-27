# Restart the link watcher after a successful in-window re-send

**Complexity: 3/10** — 1 production line added in 1 file, 8 requirements and 8 test scenarios (p=4.39); one method call on an existing branch plus a regression test.

## Goal

A far-side MCP call that is re-sent successfully inside the grace window has its grace stopped but never gets its link watcher restarted, so a second link drop before the answer arrives leaves the call with no timer and hanging indefinitely. Restart the existing watcher on that branch so a restored link with still-pending calls keeps watching, and a second drop fails those calls with the same not-connected answer the first drop would have produced.

## Requirements

1. A successful in-window re-send restarts the link watcher — "restart the link watcher after a successful in-window re-send so a second link drop still fails held calls".
2. The restart goes through the existing watcher and its guard — "relying on the existing guard in watchLink() to prevent a second interval from starting".
3. The undelivered-on-relay branch keeps its own watcher handling — "The delivered === false branch in relay() already stops the watcher before starting grace, so leave it unchanged".
4. The expiry still settles calls after a second drop — "the existing 60-tick expiry and id-preserving re-send already settle the call".
5. Re-sends keep the original correlation id — "id-preserving re-send".
6. A second drop after an in-window recovery rejects the still-pending call with `Janissary is not connected.` — the new case "flips online back to false without sending an mcp-result, advances the remaining 60 seconds, and asserts the executor rejects with Janissary is not connected."
7. The new case asserts no fresh call id was emitted — "asserts ... that the original call id remains the only id sent."
8. The one-second detection gap is accepted — "the only residual hazard is the one-second polling gap before detection, which the watcher cadence already accepts elsewhere."

## Design decisions

- The fix is a single added call to the existing private `watchLink()` on `graceTick()`'s successful-resend branch; no new timer, interval, state field, or helper is introduced.
- `watchLink()`'s own `this.watch !== undefined` guard handles the restart, so no second guard or flag is added.
- `relay()`'s `delivered === false` branch is left alone because it already stops the watcher before starting grace; the repair is confined to the recovery path.
- The 60-tick window, the `NOT_CONNECTED` text, and the id-preserving `resend()` are reused unchanged.
- No spec, help, or user/developer documentation edit is needed: the grace paragraphs already state the behavior the code will now enforce.

## Preserved behavior

1. A normal question still relays once and resolves from `mcp-result` — it must not emit an extra `mcp-call` or change the tool and arguments — pinned by `relays a question as mcp-call and settles it when mcp-result arrives`.
2. Held calls re-send under their original ids after a recovery — no new call id may be minted for a re-sent call — pinned by `re-sends an in-flight call once with its original id when the link returns inside the window`.
3. Grace expiry still fails held calls with `Janissary is not connected.` — none may be resolved or silently dropped — pinned by `fails every held call with the detach error when the grace window expires`.
4. A call that cannot be delivered at relay time still enters grace without a watcher — the `delivered === false` branch must not gain a `watchLink()` call — pinned by `holds in-flight and new calls through a link loss and re-sends them when it returns`.
5. A call made while detached still fails at once — it must not be buffered for a later session — pinned by `fails a call made while detached at once with the detach error`.
6. A call made after full recovery still relays normally — it must not stay in grace state — pinned by `relays a new call normally once the link is back`.
7. A call already in flight when the link drops still starts grace — pinned by `starts the grace window for a call already in flight when the link drops`.

## Assumptions

1. `src/remote/serve-mcp.ts:138` — `if (this.resend()) { this.detached = false; this.stopGrace(); return; }`: the successful-resend branch that currently returns without restarting the watcher.
2. `src/remote/serve-mcp.ts:157` — `if (this.watch !== undefined) return;`: the guard that makes an extra `watchLink()` call safe.
3. `src/remote/serve-mcp.ts:161` — `this.stopWatch(); this.startGrace(); this.graceTick();`: link detection clears the watcher and starts grace, so the watcher is absent during the successful re-send.
4. `src/remote/serve-mcp.ts:182` — `if (delivered === false) { this.stopWatch(); this.startGrace(); return; }`: the branch that must stay unchanged.
5. `src/remote/serve-mcp.ts:19` — `const GRACE_TICKS = 60;`: the unchanged expiry length.
6. `src/remote/serve-mcp.ts:20` — `const NOT_CONNECTED = 'Janissary is not connected.';`: the unchanged failure text.
7. `src/remote/serve-mcp.test.ts:53` — `function linkSend(frame: ServerFrame): boolean | undefined` with `if (!online) return false;`: the existing test link model the new case reuses.
8. `product/backlog/pull-request.md:11` — "the existing 60-tick expiry and id-preserving re-send already settle the call".

## Existing functionality

1. `FarSideMcp.watchLink`, the one-second watcher to restart — `src/remote/serve-mcp.ts:156`.
2. `FarSideMcp.resend`, which re-sends pending frames under their stored ids — `src/remote/serve-mcp.ts:123`.
3. `FarSideMcp.startGrace` and `stopGrace`, the grace lifecycle — `src/remote/serve-mcp.ts:146`, `src/remote/serve-mcp.ts:131`.
4. `FarSideMcp.fail`, which rejects a pending call with the not-connected error — `src/remote/serve-mcp.ts:115`.
5. The `linkSend` helper that models link state for tests — `src/remote/serve-mcp.test.ts:53`.
6. The `relayedCalls()` helper that reads sent `mcp-call` frames — `src/remote/serve-mcp.test.ts:59`.

## Implementation steps

1. In `src/remote/serve-mcp.ts`, extend `graceTick()`'s successful-resend branch to call `this.watchLink()` before returning, leaving the `delivered === false` branch in `relay()` and every other timer or state line unchanged. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Add the second-drop test in `src/remote/serve-mcp.test.ts` described under Tests, mirroring the nearby fake-timer and `linkSend` style. Build command: `$janissary/scripts/run.mjs check-diff`.
3. Read the grace paragraphs in `product/specs/mcp-server.md` and `product/specs/remote-server.md` and confirm they already describe a window that starts whenever the link drops for a waiting call; make no spec, help, or documentation edit. Build command: `$janissary/scripts/run.mjs check-diff`.

## User interface

1. No user interface surface is added or changed. The harness question panel, its answer, and the `Janissary is not connected.` message stay exactly as they are; that message now also appears when a second drop follows an in-window re-send.

## Tests

1. `src/remote/serve-mcp.test.ts` — one named test, `fails a held call when the link drops a second time after an in-window re-send`: relay a call while linked using `linkSend`, flip `online` to false so the watcher starts grace, restore `online` long enough for the single re-send, flip `online` back to false without sending an `mcp-result`, advance the remaining 60 seconds, and assert the executor rejects with `Janissary is not connected.` and that the original call id is the only id sent. Covers requirements 1, 2, 6 and 7.
2. The existing tests named in Preserved behavior must keep passing unchanged; no new test is added for the unchanged `delivered === false` branch.

## Out of scope

- No edit to `relay()`'s `delivered === false` branch.
- No new timer, interval, state field, frame type, protocol version, or dependency.
- No edit to the grace paragraphs in `product/specs/mcp-server.md` or `product/specs/remote-server.md`.
- No help page or user/developer documentation edit, and no pull request description edit.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then perform these concrete checks:

- Read `src/remote/serve-mcp.ts` and confirm `graceTick()`'s successful-resend branch now calls `this.watchLink()`, while `relay()`'s `delivered === false` branch still only calls `this.stopWatch()` and `this.startGrace()`, and `watchLink()`'s guard is untouched.
- Read the grace paragraphs in `product/specs/mcp-server.md` and `product/specs/remote-server.md` and confirm they say the window starts whenever the link drops for a waiting call, so no spec edit is owed.
- End-to-end interaction: launch a remote harness with MCP, ask a question, drop the link and restore it inside 60 seconds to see the same question re-sent under its original id, then drop the link again and wait out the window to see `Janissary is not connected.` in the harness. A failure looks like the question hanging after the second drop with no error at all.
