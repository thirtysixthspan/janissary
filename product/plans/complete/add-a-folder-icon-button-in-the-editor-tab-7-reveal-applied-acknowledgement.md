# Reveal applied acknowledgement

**Complexity: 5/10** — ~42 added lines across 9 server files, 5 requirements, 10 test scenarios (p=5.58). A second wire method through the same eight files as `05` plus `reveal-editor.ts`, and the revision-matched clear with its no-op cases; the routing, guard, and test surface drives the number rather than the line count.

## Goal

Add the `fileNavigatorRevealApplied` RPC and the server rule that removes `focus` from a navigator's restore hint once its client has applied or dropped that hint. An acknowledgement for any other revision is ignored.

## Design decisions and dependencies

This subplan depends on `add-a-folder-icon-button-in-the-editor-tab-5-reveal-rpc` for the routing pattern and on `add-a-folder-icon-button-in-the-editor-tab-6-focus-hint-and-held-selection` for the `focus` member and the applied-or-dropped vocabulary. It lands after both, because `clearRevealFocus` reads `restore.focus` and does not compile without `06`'s type member, and before `10-navigator-focus`, which is the only sender: without this subplan that send would reach no RPC. The source plan is `./product/plans/complete/add-a-folder-icon-button-in-the-editor-tab.md`, and this is its "Focus applied exactly once" decision.

- The RPC is a new member of `FileNavigatorRpcCall` (`src/protocol/file-navigator.ts:54`), last in the union after the `revealInFileNavigator` member `05` adds: `{ method: 'fileNavigatorRevealApplied'; params: { label: string; revision: number } }`. `label` is the navigator tab's label and `revision` is the hint revision the client applied or dropped. The comment says the call is fire-and-forget and reports that a focus hint has been consumed, and it names `label` as the navigator tab's label so it is not confused with `revealInFileNavigator`'s editor label.
- Its reply mode is `ack`, beside `revealInFileNavigator` in `CLIENT_METHOD_CONTRACTS` (`src/client-message.ts:7`). The table is `as const satisfies Record<ClientMessage['method'], ClientReplyMode>` (`src/client-message.ts:88`), so the method must be added there in the same change or the build fails.
- The params decoder goes at the end of `FILE_NAVIGATOR_PARAMS` (`src/client-params/file-navigator.ts:23`), after `revealInFileNavigator`, as `(p) => isString(p.label) && isInteger(p.revision)`. The source plan calls for a number; revisions come from `nextRestoreRevision` (`src/file-navigator/restore.ts:30`), which only ever produces whole numbers, so `isInteger` (`src/client-params/guards.ts:26`) is the precise guard. `isFiniteNumber` exists for fractional pixel sizes and is the wrong check here.
- Routing follows the same tab-message group as `revealInFileNavigator`: the method joins the combined case list in `src/message/handler.ts` (beside `case 'openFileNavigatorFor'` at `:40`), `dispatchTabMessage` in `src/message/tabs.ts:17` gains `case 'fileNavigatorRevealApplied'` calling `controller.fileNavigatorRevealApplied(message.params.label, message.params.revision)`, and the method is added to `TabMessage`'s `Extract` union (`src/message/tabs.ts:5`). Route it through that group, not `dispatchFileNavigatorMessage` in `src/message/file-navigator.ts`: the source plan puts both wire additions on `openFileNavigatorFor`'s path, and this is the pair's second half.
- The adapter member is `fileNavigatorRevealApplied(label: string, revision: number): void` in `FileNavigatorControllerAdapter` (`src/controller/file/navigator-adapter.ts:9`), with its factory entry beside `revealInFileNavigator`, right after the `openFileNavigatorFor` entry at `:68`. It delegates to the new wrapper. The controller wrapper in `src/controller/file/navigator.ts` checks `isOpenTab(managers, label)` first, then calls `managers.fileNavigator.clearRevealFocus(label, revision)`. The check is the one the file's other label-addressed requests use (`isOpenTab` at `src/controller/file/navigator.ts:38`): an acknowledgement for a navigator that has since closed does nothing. `isOpenTab` only checks that some tab carries the label, so a label naming an open non-navigator tab passes the guard and `clearRevealFocus` then finds no state and returns; nothing else is needed.
- The exported `clearRevealFocus(port: RevealPort, navigatorLabel: string, revision: number)` sits beside `revealEditorFile` in `src/file-navigator/reveal-editor.ts`, reusing the `RevealPort` alias `03` exports. It reads `port.states.get(navigatorLabel)`; a missing state returns. When `state.restore` is undefined, or its revision does not equal `revision`, or it carries no `focus`, it returns and changes nothing. A late acknowledgement therefore cannot strip a newer reveal's flag.
- On a match, it replaces `state.restore` with a new hint carrying the same `revision`, `cursor`, `anchor`, `anchorToCursor`, and `selected`, including their `null` and `undefined` values, and no `focus` member. The revision is deliberately not bumped: the client already recorded that revision as acted on, and a new revision would look like a fresh hint. Then it calls `port.rebuild(navigatorLabel)`, so the next broadcast carries the hint without the flag.
- The revision comparison is exact equality, not a threshold: hints are applied one at a time and a client's acknowledgement names the revision it saw. Out-of-order acknowledgements are ignored by the same rule.
- `FileNavigatorManager` gains `clearRevealFocus(label, revision)` beside `revealEditorFile` (`05` places that beside `reveal` at `src/file-navigator/manager.ts:186`), a one-line delegation through the same private `revealPort()` that `05` added. After `05`'s additions the manager is about 190 code lines, under `max-lines` but with little headroom; if this subplan crosses 200 counted lines, extract a cohesive piece into `src/file-navigator/manager/` rather than compacting.
- The source plan's rationale for the whole mechanism: without it, a later remount of the tree, such as docking or undocking it, would replay the hint and pull focus away from wherever the user is typing. `10` sends the acknowledgement; this subplan makes the server honor it.
- This is the second half of the source plan's wire additions, split from `05` because the acknowledgement's subject is the `focus` member that `06` adds. Each half is a complete typechecked wire change, and the split keeps the reveal request from carrying an acknowledgement path no client can send yet. The pair still lands before every client that consumes them.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| RPC union | `src/protocol/file-navigator.ts:54` (`FileNavigatorRpcCall`) | One member added last, after `05`'s `revealInFileNavigator`. |
| Reply-mode table | `src/client-message.ts:7` (`CLIENT_METHOD_CONTRACTS`), the `revealInFileNavigator` entry | One `ack` entry added beside it. |
| Params decoders | `src/client-params/file-navigator.ts:23` (`FILE_NAVIGATOR_PARAMS`), `isInteger` in `src/client-params/guards.ts:26` | One decoder added at the table's end. |
| Dispatcher group | `src/message/handler.ts:40` (`case 'openFileNavigatorFor'`), `src/message/tabs.ts:17` (`dispatchTabMessage`), `:5` (`TabMessage`) | The acknowledgement joins the same group. |
| Open-tab guard | `src/controller/file/navigator.ts:38` (`isOpenTab`) | Called first in the wrapper. |
| Controller adapter | `src/controller/file/navigator-adapter.ts:9` (member type), `:68` (`openFileNavigatorFor`, the neighbour of the reveal entries) | One typed member and implementation. |
| Reveal port and manager delegation | `src/file-navigator/manager.ts` (private `revealPort`, `revealEditorFile`, from `05`) | Reused for the new one-line method. |
| Port state and rebuild | `src/file-navigator/port.ts:3` (`BasePort.states`, `rebuild`) | Both reads `clearRevealFocus` needs, already on the port. |
| Hint shape and rebuild | `src/file-navigator/state.ts:93` (`restore`), `src/file-navigator/reveal-editor.ts` (hint writer, from `03` and `06`) | The fields preserved by the clear. |
| Existing params tests | `src/client-params/file-navigator.test.ts:4` (`CASES`) | One row added; it is typed `keyof typeof FILE_NAVIGATOR_PARAMS`, so it fails typecheck until the union carries the method. |
| Routing test precedents | `src/message/handler.test.ts:483` (`routes openFileNavigatorFor`), `src/controller/file/navigator.test.ts:221` (the `openFileNavigatorFor` delegation test) | The two new tests mirror them. |

## Proposed changes

- Add the acknowledgement RPC and its comment last in the union in `src/protocol/file-navigator.ts`.
- Add the `ack` entry to `src/client-message.ts`, beside `revealInFileNavigator`.
- Add the decoder at the end of `src/client-params/file-navigator.ts`.
- Add the method to the tab-message group in `src/message/handler.ts` and the case plus the `TabMessage` union member in `src/message/tabs.ts`. Leave `src/message/file-navigator.ts` untouched.
- Add the adapter member and implementation in `src/controller/file/navigator-adapter.ts`, beside `revealInFileNavigator`; the factory's declared return type makes a missing entry a compile error.
- Add the exported wrapper with the `isOpenTab` guard in `src/controller/file/navigator.ts`, beside `openFileNavigatorFor` (`:170`).
- Add the exported `clearRevealFocus` to `src/file-navigator/reveal-editor.ts` and the manager delegation in `src/file-navigator/manager.ts`.
- Leave `src/file-navigator/reveal-editor.ts` and `src/file-navigator/manager.ts` under 200 counted code lines. `reveal-editor.ts` is near 150 raw lines after `04` and lands near 175 here; if it crosses, move `clearRevealFocus` to a sibling module in `src/file-navigator/` rather than compacting. The manager is covered by its design bullet above.
- Add no client code. `10` is the first sender; an unused wire method is not flagged by ESLint, and `knip` runs only in the full human check.

Three test files need no edit. `src/client-message.test.ts` asserts only the exact `result` and `deferred` sets (`:51` and `:67`), so a new `ack` member leaves it alone. `src/client-params/index.test.ts:15` compares the decoder keys against the contract keys, so it passes once both tables carry the method. `src/controller/file/navigator-adapter.test.ts` needs no case: the adapter's factory return is typed `FileNavigatorControllerAdapter`, so a missing member or entry fails typecheck.

## Tests

In `src/client-params/file-navigator.test.ts`, add one row to `CASES` (`:4`), modelled on the `openFileNavigatorFor` row at `:72`:

- `fileNavigatorRevealApplied` accepts `{ label: 'files', revision: 4 }` and any other string label with an integer revision.
- It rejects a missing label, a non-string label, a missing revision, a non-number revision, and a fractional revision. The rejection is what `clientParamsProblem` reports as `Invalid fileNavigatorRevealApplied params`, built from the method name at `src/client-message.ts:123`, so add no case in `src/client-message.test.ts`.

In `src/file-navigator/reveal-editor.test.ts`, for `clearRevealFocus`, using the fake port that `03` and `04` establish:

- A matching revision clears `focus` and leaves `revision`, `cursor`, `anchor`, `anchorToCursor`, and `selected` unchanged, and calls `rebuild` once.
- A stale revision leaves `focus` in place and does not call `rebuild`.
- A hint with no `focus`, an undefined `restore`, and a missing navigator state are each a silent no-op that does not call `rebuild`.

In `src/message/handler.test.ts`, beside `routes openFileNavigatorFor` (`:483`):

- `fileNavigatorRevealApplied` reaches `controller.fileNavigatorRevealApplied` with the navigator label and revision and replies `{ result: 'ok' }`. Add `fileNavigatorRevealApplied: vi.fn()` to `makeController` (`:6`), or the dispatch throws on an undefined member.

In `src/controller/file/navigator.test.ts`, beside the `openFileNavigatorFor` delegation test (`:221`):

- The wrapper delegates once to `FileNavigatorManager.clearRevealFocus` with the label and revision, using that file's `makeManagers` fake (`:14`) with a `clearRevealFocus` spy.
- A label no open tab carries calls nothing, so the `isOpenTab` guard is proven rather than only compile-checked.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. It typechecks the server project, which is the real proof that the union, the reply-mode table, the decoder, the dispatcher, and the adapter agree. Run `npx vitest run --project server src/client-params/file-navigator.test.ts src/file-navigator/reveal-editor.test.ts src/message/handler.test.ts src/controller/file/navigator.test.ts`. Read the diff to confirm `clearRevealFocus` never bumps the revision or drops a selection field, and that the wrapper returns before touching the manager for a label no open tab carries.

There is no manual end-to-end check at this stage: nothing sends the acknowledgement until `10`, and the visible dock/undock outcome is `13-end-to-end-verification`'s. Do not add a temporary sender or a debug command here.

## Out of scope

- No client sender and no change to `focusHintStatus`, `useFileNavigatorSelection`, or `FileNavigatorTab.tsx`; `10` sends the acknowledgement and `06` owns the hold.
- No change to how the reveal writes the hint or which revision it uses.
- No other clear path: no removal of `focus` on retarget, re-root, or close. A newer hint overwrites `restore` wholesale and a closed tab drops the state, so this acknowledgement is the only place the flag is stripped.
- No notification, timeout, or retry.
- No change to the ordinary `files` restore hint or to the search pop-up.
- No change to `revealInFileNavigator`, `openFileNavigatorFor`, the editor button, or the key binding.
