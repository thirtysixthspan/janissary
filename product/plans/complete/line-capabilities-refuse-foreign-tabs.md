# One ownership answer for the line and ACP capabilities

## Complexity

5/10 — one shared predicate extracted, two capability modules rewired to it, and the four silent branches answered. The behavior change is deliberate and user-visible in exactly the cases that used to be invisible.

## Goal

`src/plugins/line-capabilities.ts` and `src/plugins/acp-capabilities.ts` are built from the same six-field input and answer the same question — may this plugin act on that tab — with the same id check, but one answers `undefined` and four capabilities then no-op while the other throws `TabPluginRejection('ACP tab is unavailable.')`. A `queueLine`, `nextQueuedLine`, `recordCwd` or `recordGlobalHistory` call aimed at a tab the plugin does not own is therefore neither a rejection nor a failure and is silently discarded: a plugin queues into the wrong tab and sees nothing happen, with no transcript line and no RPC error, while the identical mistake against `startAcp` is answered. The documented rule that a request a caller could have gotten wrong gets a rejection is enforced by one capability group and not by its neighbour.

## Approach

Extract the ownership check into one shared predicate beside `src/plugins/api-capabilities.ts`, which already owns `TabPluginRejection`, and have both modules call it. The predicate answers with the tab label when the tab is the plugin's own and throws with the caller's reason when it is not, so the message can name the capability and the transcript line says which call was refused. The four line capabilities that no-op call it with their own reason; `acpCapabilities` calls it with the message it already uses, which its own test pins. Each module keeps its own `isEnabled` handling — a disabled plugin is a different question from a foreign tab — so the existing disabled-plugin behavior is untouched.

## Implementation

1. Add `src/plugins/own-tab.ts` exporting `ownTabLabel(input, reason)`: the label is `answeringLabel ?? origin.label`, and the tab is the plugin's own when `managers.tab.byLabel(label)?.plugin?.id === declaration.id`; otherwise it throws `new TabPluginRejection(reason)`. `input` carries the same `{ managers, declaration, origin, answeringLabel }` both capability modules already destructure.
2. In `src/plugins/line-capabilities.ts`, drop the local `ownLineLabel` and rewire `queueLine`, `nextQueuedLine`, `recordCwd`, and `recordGlobalHistory` to call the shared predicate with a reason naming the capability, keeping their `isEnabled` guards exactly as they are and leaving `originTab`, `dispatchLineWithOutput`, `completeLine`, and `terminalRunning` untouched.
3. In `src/plugins/acp-capabilities.ts`, replace the inline check with the shared predicate, keeping the `isEnabled` guard and the `'ACP tab is unavailable.'` reason.
4. Update the two suites that pinned the silent branches: `src/plugins/shell-capabilities.test.ts` (the wrong-tab queue and directory cases become rejections naming the capability, and assert the queue and `setCwd` are still untouched) and `src/plugins/record-global-history.test.ts` (the not-own-tab case becomes a rejection; the blank-line-from-own-tab case stays a no-op).
5. Run `./scripts/run.mjs check-diff` after the predicate, after each module, and after the tests.

## Tests

- `src/plugins/own-tab.ts` gains no test of its own; its answers are pinned through both capability suites.
- `src/plugins/shell-capabilities.test.ts`: `queueLine` and `nextQueuedLine` against the origin tab another plugin command was invoked from, and against a tab another plugin owns, now throw `This plugin has no open tab to queue a line in.` / `… to take a queued line from.` and leave the queue untouched; `recordCwd` in the same two situations throws `This plugin has no open tab to record a directory in.` and leaves `setCwd` untouched. The disabled-plugin cases keep their silent no-op, and the own-tab cases keep their effects.
- `src/plugins/record-global-history.test.ts`: a line from a tab that is not the plugin's own throws `This plugin has no open tab to record a line in.` and records nothing; a blank line from the plugin's own tab still records nothing without throwing.
- `src/acp/plugin-session.test.ts` passes unchanged — the ACP rejection message and its trigger are exactly what they were.

## Out of scope

- `originTab`, `dispatchLineWithOutput`, `completeLine`, and `terminalRunning`; they answer with `null`/empty results rather than acting on a tab, and the item names only the four acting capabilities.
- The `isEnabled` question: a disabled plugin keeps its current answer in both groups.
- Any change to what the capabilities do when the tab IS the plugin's own.

## Verification

- `./scripts/run.mjs check-diff` passes after each step.
- A search for `ownLineLabel` finds nothing; both modules read the same predicate from `own-tab.ts`.
- The four rejection messages each name the capability, so the transcript line a user sees says which call was refused.

## Documentation and specification impact

None beyond the behavior change itself: a plugin capability call aimed at a foreign tab now produces a rejection transcript line instead of silence. The plugin contract docs describe capability behavior in `ai/guidelines/plugins.md`, which neither `help.md` nor `documentation/user-documentation/` restates, so no user-facing documentation changes; the spec tree carries no per-capability contract file.
