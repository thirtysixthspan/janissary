# Reveal in file navigator RPC

**Complexity: 4/10** — ~28 added lines across 8 production files, 4 requirements, 6 test scenarios (p=5.15). The line count is small; the cost is the wire contract reaching the ack map, the param decoder, the dispatcher, the adapter, the controller wrapper, and the manager in one typechecked change, plus the routing tests that keep the new arm honest.

## Goal

Expose the implemented reveal operation over the client-to-server RPC contract. Add the fire-and-forget `revealInFileNavigator` method, validate its params, route it to the file-navigator controller adapter, and delegate from the manager to `revealEditorFile`. No client code calls it yet.

## Design decisions and dependencies

This subplan depends on `add-a-folder-icon-button-in-the-editor-tab-3-local-reveal` and `add-a-folder-icon-button-in-the-editor-tab-4-remote-reveal`, whose `revealEditorFile` it exposes, and on `01` for the port's blocked rule. It is the source plan's "Wire contract" section plus the manager delegation for the reveal request. `06` and `07` add the focus flag and the acknowledgement RPC; `08` is the first client caller. The source plan is `./product/plans/complete/add-a-folder-icon-button-in-the-editor-tab.md`.

- The RPC is a new member of `FileNavigatorRpcCall` (`src/protocol/file-navigator.ts:54`): `{ method: 'revealInFileNavigator'; params: { label: string } }`. It goes last in the union, after `openFileNavigatorFor` at `:161`, which is the union's current last member. `label` is the editor tab's label, not a navigator label, and it travels unchanged: this path does no index lookup and no label resolution. The comment says the server resolves the edited file's navigator, expands its ancestors, selects it, and that the call is fire-and-forget; it also says a blocked, vanished, or non-editor label is a silent no-op whose only signal is the next state broadcast.
- Its reply mode is `ack`, added beside `openFileNavigatorFor` (`src/client-message.ts:51`) in `CLIENT_METHOD_CONTRACTS` (`src/client-message.ts:7`). The `ack` is the envelope's acknowledgement only, not the reveal's outcome. The table is `as const satisfies Record<ClientMessage['method'], ClientReplyMode>` (`src/client-message.ts:88`), so the method must be added there in the same change or the build fails.
- The params decoder goes in `FILE_NAVIGATOR_PARAMS` (`src/client-params/file-navigator.ts:23`), as `(p) => isString(p.label)`, at the end of the table after `openFileNavigatorFor: (p) => isString(p.label)` at `:55`, which is its exact model. Do not copy the `revealFileNavigatorItem` decoder at `:43`: that is the search pop-up's row reveal, a different method whose params are `index` and `relPath`. The decoder record is keyed by the RPC union, so it must land with the union.
- Routing follows `openFileNavigatorFor`'s path exactly, as the source plan requires: the method joins the tab-message group in `src/message/handler.ts` (the `case 'openFileNavigatorFor'` arm at line 40), and `dispatchTabMessage` in `src/message/tabs.ts:17` gains a case calling `controller.revealInFileNavigator(message.params.label)`. `TabMessage` in that file gains the method in its `Extract` union. Do not route it through `dispatchFileNavigatorMessage` in `src/message/file-navigator.ts`: that file's `revealFileNavigatorItem` arm (`:105`) is the unrelated search-pop-up reveal, and its group's vocabulary is a tab index plus a tree-relative path, neither of which this request carries.
- The controller method is a new member of `FileNavigatorControllerAdapter` (`src/controller/file/navigator-adapter.ts:9`), `revealInFileNavigator(label: string): void`, implemented by delegating to `fileNavigatorRpc.revealInFileNavigator(managers, label)`. The adapter factory is already spread into the controller by `createControllerAdapters` (`src/controller/create-adapters.ts:18`), and `Controller` is `ControllerCore & ControllerMembers` (`src/controller.ts`, last line), so `src/controller.ts` is not edited.
- The wrapper in `src/controller/file/navigator.ts` is exported from beside `openFileNavigatorFor` (`:170`) and delegates to `managers.fileNavigator.revealEditorFile(label)`. It does not call `isOpenTab`: the label names an editor tab, not a navigator, and `revealEditorFile` already returns silently when the tab is gone or is not an editor. The acknowledgement wrapper in `07` does check `isOpenTab`, because its label names a navigator.
- `FileNavigatorManager` (`src/file-navigator/manager.ts:32`) gains `revealEditorFile(editorLabel: string): void`, a one-line delegation to the module function, placed beside the existing `reveal` (`:186`). It needs a port that is both the open port and the navigation port. Add a private `revealPort()` beside `portClosures()`, composing `{ ...this.openPort(), ...this.navPort() }` and keeping `tabs` and the watcher plumbing private exactly as the two existing port methods do (`src/file-navigator/manager.ts:75` and `:107`). Type it as `RevealPort`, the alias `03` exports from `src/file-navigator/reveal-editor.ts`, and import `revealEditorFile` and that type (a type-only import, and the only import this file adds) from `./reveal-editor.js` with the `.js` extension, so a later port change fails here rather than being absorbed by an inline object spread. Do not widen `OpenPort` or `NavPort` for this.
- The call is fire-and-forget, so the client learns the outcome only through the next state broadcast. That is the same contract as `openFileNavigatorFor`.
- This refines the source plan's landing order in one respect: the pure modules and the reveal implementation land in `01` through `04`, and this subplan exposes them. A wire member cannot land before the function its dispatcher calls without a stub, and the source plan forbids dead scaffolding. Every client consumer still lands after the wire, so each subplan leaves `check-diff` green on its own.
- The manager is 278 raw lines and `src/controller/file/navigator.ts` is 206 raw. Both are under the counted limit today because their comments are excluded: roughly 180 and 170 counted lines, leaving about 20 and 30 lines of headroom before the 200-line rule. The additions above fit. If either crosses 200 counted lines, extract a cohesive piece into the feature's existing `manager/` directory or a sibling controller module; never compact.
- The server treats a blocked editor as a silent no-op even though the client disables the button. The check is the same `editorRevealBlocked` call from `01`, inside `revealEditorFile`; this subplan adds no second check.
- Three files need no change beyond what the tests below add. `src/client-message.test.ts` asserts only the exact `result` and `deferred` method sets (`:51` and `:67`), so a new `ack` member leaves it alone. `src/client-params/index.test.ts:15` compares the decoder keys against the contract keys, so it passes once both tables carry the method. `src/message/handler.test.ts`'s controller fake is cast `as unknown as Controller`, so it compiles without a new member; only the spy for its new case is added.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| RPC union and comments | `src/protocol/file-navigator.ts:54` (`FileNavigatorRpcCall`), the `openFileNavigatorFor` member at `:161` | One member added last. |
| Reply-mode table | `src/client-message.ts:7` (`CLIENT_METHOD_CONTRACTS`), the `openFileNavigatorFor` entry at line 51 | One `ack` entry added. |
| Params decoders | `src/client-params/file-navigator.ts:23` (`FILE_NAVIGATOR_PARAMS`), `openFileNavigatorFor` at `:55` | One decoder added, modelled on that entry. |
| Dispatcher group | `src/message/handler.ts:40` (`case 'openFileNavigatorFor'`), `src/message/tabs.ts:17` (`dispatchTabMessage`) | The new method follows the same path. |
| Dispatcher exhaustiveness | `src/client-message.ts:95` (`unhandledClientMethod(message: never)`) | Turns a missing arm into a compile error, which the new routing test backs at runtime. |
| Controller adapter | `src/controller/file/navigator-adapter.ts:9`, the `openFileNavigatorFor` member at `:35` and factory entry at `:68` | One typed member and its one-line implementation. |
| Controller wrappers | `src/controller/file/navigator.ts:170` (`openFileNavigatorFor`) | The model and the placement for the new wrapper. |
| Manager ports | `src/file-navigator/manager.ts:75` (`navPort`), `:107` (`openPort`) | Composed into `revealPort()`. |
| Manager reveal entry | `src/file-navigator/manager.ts:186` (`reveal`) | The method the new one sits beside. |
| Reveal implementation | `src/file-navigator/reveal-editor.ts` (`revealEditorFile` and `RevealPort`, from `03` and `04`) | The delegation target and the port type. |
| Existing params tests | `src/client-params/file-navigator.test.ts`, the `CASES` table at `:4` | One row added; it is typed `keyof typeof FILE_NAVIGATOR_PARAMS`, so it fails typecheck until the union carries the method. |
| Routing test precedents | `src/message/handler.test.ts:483` (`routes openFileNavigatorFor`), `src/controller/file/navigator.test.ts:221` (the `openFileNavigatorFor` delegation test) | The two new tests mirror them. |

## Proposed changes

- Add the RPC member and its comment at the end of the union in `src/protocol/file-navigator.ts`.
- Add the `ack` entry to `src/client-message.ts`.
- Add the decoder to `src/client-params/file-navigator.ts`, at the table's end.
- Add the method to the tab-message group in `src/message/handler.ts` and the case plus the `TabMessage` union member in `src/message/tabs.ts`. Leave `src/message/file-navigator.ts` untouched.
- Add the adapter member and implementation in `src/controller/file/navigator-adapter.ts`, beside `openFileNavigatorFor`.
- Add the exported wrapper in `src/controller/file/navigator.ts`, after `openFileNavigatorFor`.
- Add `revealEditorFile` and the private `revealPort()` to `src/file-navigator/manager.ts`, importing the function and the `RevealPort` type from `./reveal-editor.js`.
- Add no client code. The method is unused from `web/src/` until `08`; ESLint does not flag an unused wire method, and `knip` runs only in the full human check.
- Change nothing in `src/controller.ts`, `src/controller/create-adapters.ts`, `src/message/file-navigator.ts`, or the three no-change test files named above.

## Tests

In `src/client-params/file-navigator.test.ts`, add one row to `CASES` (`:4`):

- `revealInFileNavigator` accepts `{ label: 'editor' }` and any other string label.
- It rejects a missing label, a non-string label, and a null label. The rejection is what `clientParamsProblem` reports as `Invalid revealInFileNavigator params`; `src/client-message.test.ts:82` already proves that naming for every method, so add no case there.

In `src/message/handler.test.ts`, beside `routes openFileNavigatorFor` (`:483`):

- `revealInFileNavigator` reaches `controller.revealInFileNavigator` with the editor's label and replies `{ result: 'ok' }`. Add `revealInFileNavigator: vi.fn()` to `makeController` (`:6`), or the dispatch throws on an undefined member.

In `src/controller/file/navigator.test.ts`, beside the `openFileNavigatorFor` delegation test (`:221`):

- The wrapper delegates once to `FileNavigatorManager.revealEditorFile` with the label, using that file's `makeManagers` fake (`:14`) with a `revealEditorFile` spy.

No new test is needed for the purpose-level behavior: the reveal itself is covered in `03` and `04`. The typecheck still carries the missing-arm proof: `CLIENT_METHOD_CONTRACTS`, `FILE_NAVIGATOR_PARAMS`, the dispatcher's `unhandledClientMethod(message: never)` default, and the adapter's declared type all fail the build if one of them is missed.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. It typechecks the server project, which is the real proof that the wire additions and the routing agree. Run `npx vitest run --project server src/client-params/file-navigator.test.ts src/message/handler.test.ts src/controller/file/navigator.test.ts src/file-navigator/reveal-editor.test.ts`. Read the diff to confirm `openFileNavigatorFor` and its controller path are untouched and that `src/message/file-navigator.ts` has no diff.

There is no manual end-to-end check at this stage: no client sends the request until `08` adds the button and its sender. `13-end-to-end-verification` owns the user-visible check; do not add a temporary caller or a debug command here.

## Out of scope

- The `fileNavigatorRevealApplied` acknowledgement RPC, the `focus` hint member, and `clearRevealFocus`; `07` owns them.
- The editor button, its sender, and the key binding; `08` and `09` own them.
- The navigator client and the sidebar host; `10` and `11` own them.
- The spec, help, and user-documentation edits; `12` owns them, and `13` owns the end-to-end verification.
- No change to `openFileNavigatorFor`, the shell and harness folder button, or the `files` command.
- No notification and no error reply for a blocked or vanished editor.
