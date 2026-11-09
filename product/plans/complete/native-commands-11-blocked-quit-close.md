# Native commands: report and consume disabled quit and close lines

**Complexity: 3/10** — one client intercept branch, one optional callback threaded from the app shell, and the tests and spec that pin the new path. The report RPC and server notification already exist.

## Goal

A command-bar `quit` or `close` line that the client's snapshot marks disabled must not be offered to the server as a raw command, where it would bypass the quit confirmation or the save guard. The client consumes the line, reports the canonical command to the server, and the server re-checks its current snapshot through the existing `reportBlockedCommand` path and emits the existing command-disabled notification. Every other disabled line keeps the current offer-to-server path so its refusal output still appears in the tab.

## Decisions and dependencies

- Depends on completed unit 10 in `product/plans/complete/native-commands-10-client-integration.md`: the `disabledApplicationCommand` predicate, the `reportBlockedCommand` RPC, and `refuseDisabledCommand` are already in place.
- Classify the line before deciding what a disabled line does. Only `confirm-quit` and `confirm-close` are consumed and reported; every other disabled verdict keeps the existing `return false` so the server refusal appears in the tab.
- The reported word is the canonical command, not the verdict. A `close` or `exit` line that would take the last tab classifies as `confirm-quit` but reports `close`; a `quit` line reports `quit`. Use the shared `isCloseCommand` on the trimmed, slash-stripped line to tell them apart.
- Attribute the report to `sourceTab ?? tabs[activeTab]?.label`. Skip the report when neither is known, matching the shortcut path, but still consume the line.
- Add `reportBlockedCommand` as an optional parameter on `useAppCommandLine`, so the direct test callers that do not pass it keep compiling. The app shell builds one stable callback and passes it.
- Do not open the quit confirmation or the save guard for a consumed line, and do not add a client toast, transcript entry, event type, config field, or server change.

## What already exists (reuse, don't rebuild)

| Need | Existing implementation |
| --- | --- |
| Disabled-line gate and command-bar classification | `web/src/shared/command-bar/AppCommandBar.tsx` `useAppCommandLine`; `web/src/shared/command-bar/classify-submit.ts` `classifyCommandBarSubmit` |
| Canonical close spelling | `src/commands/parse-close.ts` `isCloseCommand` |
| Client report RPC | `web/src/useWindowKeys.ts` `reportBlockedCommand` send; `src/controller.ts` `reportBlockedCommand` |
| Server re-check and notification | `src/native-commands/dispatch-policy.ts` `refuseDisabledCommand`; existing `command-disabled` ambient event |
| App shell wiring | `web/src/App.tsx` `useAppCommandLine` call beside `runCommand` |
| Test helpers | `web/src/shared/command-bar/AppCommandBar.test.tsx` `build` and `disabledBy`; `web/src/App.test.tsx` `EmitState` |

## Proposed changes

1. In `web/src/shared/command-bar/AppCommandBar.tsx`, add the optional `reportBlockedCommand(text, tab)` parameter and classify before the disabled check. For a disabled line whose verdict is `confirm-quit` or `confirm-close`, report the canonical word and return `true`; for every other disabled verdict return `false` as today. Keep the enabled branches unchanged.
2. Add `web/src/useAppCommands.ts` with the command-sending callbacks (`runCommand`, `onQuit`, and the new `reportBlockedCommand`) and use it from `web/src/App.tsx`, passing the report callback to `useAppCommandLine`. Moving the two existing callbacks keeps `App.tsx` under the 200-code-line limit without compacting it.
3. Update `web/src/shared/command-bar/AppCommandBar.test.tsx`: disabled quit reports and consumes without opening the confirmation; disabled bare, alias, named, and slash close lines report `close` and consume without running the guard; a disabled close that would quit reports `close`, not `quit`; every other disabled line still returns `false` and reports nothing; enabled quit and close cases stay unchanged.
4. Update `web/src/App.test.tsx`'s disabled quit case to expect the report RPC and no command dispatch or confirmation.
5. Update `product/specs/application-commands.md` so disabled quit and close lines are reported and consumed, with the existing command-disabled notification as the only feedback, while other disabled lines keep their refusal output.
6. Update verification step 1 in `product/plans/complete/native-commands-10-client-integration.md` to expect the report-and-consume behavior for quit and close instead of a tab refusal.

## Tests

- `web/src/shared/command-bar/AppCommandBar.test.tsx`: disabled `quit` reports `quit` and consumes without `openQuitConfirm`; disabled `close`, `exit`, `close other`, and `/close` report `close` and consume without the guard; a disabled last-tab close reports `close` rather than `quit`; the existing disabled theme, hist, queue, tasks, syntax, and profile cases still return `false` and report nothing; enabled quit and close cases stay green.
- `web/src/App.test.tsx`: a disabled `quit` line sends `reportBlockedCommand` with `{ text: 'quit', tab: 'janus' }`, does not send a `command`, and opens no confirmation.

## Verification

Run `$janissary/scripts/run.mjs check-diff` during development. Focused run: `npx vitest run --project client web/src/shared/command-bar/AppCommandBar.test.tsx web/src/App.test.tsx`.

Manual check: with `quit` and `close` disabled, submit each from the command bar and confirm the line is consumed with no confirmation, save guard, or tab refusal; with the command-disabled notification enabled, confirm it is the only feedback, and with it off or the tab active confirm the line is silent. Re-enable both and confirm the existing confirmation and guard behavior returns.

## Out of scope

- Server dispatch, the report RPC, notification delivery, and the settings snapshot.
- Enabled quit and close behavior, direct tab-close gestures such as `Cmd+W` and the tab-strip close control.
- The in-app help pages, which are covered by a separate pull-request backlog entry.
- Any local toast, transcript output, event type, or config field for a blocked line.
