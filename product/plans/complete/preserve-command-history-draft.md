# Preserve Command Draft During History Recall

**Complexity: 2/10** — one transient ref in the existing command input navigation path, two focused interaction tests, and small updates to the history spec and existing user documentation.

## Goal

Keep text already typed in the command bar when the user presses Up to inspect older commands, and restore that unexecuted draft when Down returns past the newest history entry.

## Approach

Capture the current command input in a ref only when history navigation begins from the live input position. Continue recalling the real per-tab history array as before. When navigation advances past its newest entry, restore the captured draft instead of clearing the input. The draft remains ephemeral client state: it is not submitted, persisted, shown in the history picker, or added to per-tab/global command history.

## Implementation steps

1. Add a command-draft ref to `CommandInput`, capture it on the first older-history recall, restore it past the newest entry, and clear it on submit.
2. Extend command input tests for restoring a non-empty draft and preserving the existing empty-input behavior.
3. Update the history functional spec and the existing command-history user guide. `help.md` names the arrow bindings but does not describe end-of-history clearing, so it needs no change.

## Tests

- Extend `web/src/CommandInput.test.tsx` to verify `typed draft → ↑ → ↓` restores the draft.
- Verify starting from an empty input still returns to an empty input after the same navigation.

## Out of scope

- Persisting unexecuted drafts across tab switches or application relaunches.
- Adding drafts to the history picker, per-tab history, or global history.
- Changing ghost-text suggestions or multi-line arrow boundary rules.
