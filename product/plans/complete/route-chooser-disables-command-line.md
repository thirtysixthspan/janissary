# Disable the command line while the route chooser is open

**Complexity: 3/10**. A new flag on the overlay registry, one prop threaded from `AppMain` down to the command bar's textarea, and a refocus when the chooser closes. The only subtle part is focus: a disabled textarea loses it, and the user expects to be back on the command line once the chooser is answered.

## Root cause

The route chooser claims the command bar's keys but never disables the bar itself. `commandBarSuppressed` in `web/src/pickers/overlay-registry.ts` reports the chooser as an overlay that claims the bar. `AgentTabBody` passes that to `CommandInput` as `pickerOpen`, and `CommandInput`'s key handler then returns early. But nothing passes `disabled` to `CommandBarShell`, which only disables its `<textarea>` when a caller asks. So the textarea keeps focus and takes typed text through `onChange`. Meanwhile `dispatchModalKey` in `web/src/useWindowKeys.ts` hands Enter to `handleRouteChooserKey`, which picks the highlighted route. The typed command is never run or queued. It just sits in the command line while the chooser's route runs instead.

## Correct behavior

`product/specs/command-routing.md`, Route chooser: the overlay "is **modal**: the command input is disabled while it is open. **Up/Down** move the selection, **Return** picks, **Escape** cancels (a row can also be clicked). The overlay closes automatically when the next `state` event reports `route: null`." So while `route` is non-null the command line is disabled and takes no text. Once the server reports `route: null`, it's enabled again. Since disabling it drops focus, it takes focus back at that point, so the user can keep typing where they were.

## Reproduction

The bug report reproduced it live: with a `route: zzz qqq xxx` chooser open, the textarea reported `disabled === false`, took `notify typed-during-chooser` verbatim, and Enter ran the chooser's `acp (agent prompt)` route while the typed command went nowhere. New cases in `web/src/App.test.tsx` › `App route chooser modality`, written before the fix, fail against it at `expect(input).toBeDisabled()`:

- "disables the command line while the chooser is open, so typed text never runs and Enter picks the route"
- "re-enables and refocuses the command line once the server reports route: null"

## Approach

1. **Registry.** `OverlayDescriptor` gains `disablesCommandBar`, true for `route` only, with the reason beside it. A new `commandBarDisabled(state)` answers from it, next to `commandBarSuppressed`. The other overlays that claim the bar keep today's behavior. The spec promises disabling only for the chooser, and pickers such as the history picker or quick open have their own reasons to leave the bar enabled.
2. **Threading.** `AppMain` passes `commandBarDisabled={commandBarDisabled(pickers.overlays)}` to `AgentTabBody`, which passes `disabled` through `CommandArea` to `CommandInput` and on to `CommandBarShell`.
3. **Focus.** `CommandInput` focuses its textarea when `disabled` goes from true to false.

Rejected: disabling the bar for every overlay that claims it. That changes behavior the spec doesn't ask about. Also rejected: dropping `onChange` while the chooser is open instead of disabling the textarea. The textarea would still look live and hold focus, which is the mismatch the report describes.

## Implementation steps

1. `web/src/pickers/overlay-registry.ts`: `disablesCommandBar` and `commandBarDisabled`.
2. `web/src/AppMain.tsx`, `web/src/agent-tabs/AgentTabBody.tsx`, `web/src/agent-tabs/command-input/CommandArea.tsx`: thread the flag.
3. `web/src/agent-tabs/command-input/CommandInput.tsx`: `disabled` prop, passed to the shell, with the refocus on re-enable.
4. Tests: the two `App.test.tsx` cases above; an `overlay-registry.test.ts` case for `commandBarDisabled`.

## Regression test

`web/src/App.test.tsx` › `App route chooser modality` › both cases.

## Verification

Run `./scripts/run.mjs check-diff`. Live: build the fix, start a scratch instance under `./temp/fix-a-bug/`, and drive it with `./temp/fix-a-bug-drivers/verify.mjs`. The driver types `zzz qqq xxx` and waits for the `.picker` titled `route: zzz qqq xxx`. It records the textarea's `disabled` state, clicks the command line, types `notify typed-during-chooser`, and presses Enter. Then it records the textarea's value, the transcript, whether the chooser closed, whether the textarea is enabled and focused again, and the notifications feed. Expected: disabled while open, empty value, the chooser's `acp (agent prompt)` route runs, the chooser closes, the textarea is enabled and focused, and no `typed-during-chooser` notification.

Outcome: verified. The chooser opened titled `route: zzz qqq xxx` with `acp (agent prompt)` selected. The textarea was disabled and empty, and it stayed empty after the driver clicked the command line and typed `notify typed-during-chooser`. Enter closed the chooser, and the transcript showed the `zzz qqq xxx` prompt. The textarea was then enabled, empty, and focused, and nothing on the page mentioned `typed-during-chooser`. Typing `echo back` afterwards landed in the command line.

## Spec and docs

The spec already describes the correct behavior. `product/specs/command-routing.md` now also mentions the refocus on close and the registry flag. `documentation/user-documentation/command-bar/shell.md` already says the bar is disabled until you choose or cancel, so it doesn't change, and `help.md` doesn't describe the chooser.

## Out of scope

- Other overlays' command-bar behavior.
- The chooser's own keys and rows.
