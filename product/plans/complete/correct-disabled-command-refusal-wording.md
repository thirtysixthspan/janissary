# Correct the disabled-command refusal wording in help and user documentation

**Complexity: 3/10** — documentation-only correction across two help pages and one user-documentation page, checked against the shipped dispatch, notification, shortcut, and close paths. No source, test, or behavior change.

## Goal

The help and user documentation say a disabled command's line reaches the server and is refused there, and that its confirmation never opens. That is true for ordinary command-bar lines, but not for `quit` and `close` lines typed into a command bar: those are consumed by the client and reported to the server, whose `command-disabled` notification is their only feedback. Closing the last tab from `Cmd+W`/`Ctrl+W` or the tab strip still opens the quit confirmation first, and the `quit` it dispatches is then refused. `help/search.md` also says bare `search` does nothing, when the server actually refuses it with `Command is disabled: search.`.

Correct the three passages so they match the shipped behavior and the existing `product/specs/application-commands.md` description.

## Approach

- In `help/commands.md`, rewrite the disabled-command note to separate ordinary command-bar lines (offered to the server and refused there with `Command is disabled: <command>.`) from disabled `quit`/`close` lines (consumed and reported, with the existing `command-disabled` notification as their only feedback when the ambient toggle and focus rules allow it). Add that the `Cmd+W`/tab-strip last-tab confirmation still opens before its dispatched `quit` is refused.
- In `documentation/user-documentation/command-bar/commands.md`, make the same distinction in the existing disabled-command paragraph, keeping its command-bar qualifier.
- In `help/search.md`, replace the claim that bare `search` does nothing: bare `search` is refused with the server's `Command is disabled: search.` output, `Cmd+Shift+F` is blocked, and `search transcript` is refused instead of opening the find overlay, while `Cmd+F` still opens the empty find.
- Leave `help/close.md` and `help/quit.md` unchanged; both already state the last-tab confirmation path correctly.

## Implementation steps

1. Verify the wording against `web/src/shared/command-bar/AppCommandBar.tsx` (consumed `quit`/`close` lines), `web/src/useCmdW.ts` and `web/src/App.tsx` (last-tab confirmation before the dispatched `quit`), `src/native-commands/dispatch-policy.ts` (server refusal and notification), and the shell search routing in `web/src/plugins/shell`.
2. Rewrite the disabled-command note in `help/commands.md`.
3. Rewrite the disabled-command paragraph in `documentation/user-documentation/command-bar/commands.md`.
4. Rewrite the disabled-search note in `help/search.md`.
5. Run `$janissary/scripts/run.mjs check-diff` after the edits.

## Tests

None — documentation-only change with no executable behavior to test. `check-diff` verifies the changed markdown passes the diff-scoped lint and that no code checks are affected.

## Spec

No spec change needed: `product/specs/application-commands.md` already describes the ordinary refusal, the consumed `quit`/`close` line, the `command-disabled` notification and its focus/toggle rules, and the blocked shortcut behavior this documentation now matches. `product/specs/keyboard-navigation.md` already describes the blocked shortcut.

## Docs

- `help/commands.md` — correct the disabled-command note.
- `help/search.md` — correct the disabled-search note.
- `documentation/user-documentation/command-bar/commands.md` — correct the disabled-command paragraph.

## Out of scope

- Any source, test, or behavior change.
- `help/close.md` and `help/quit.md`, which already state the last-tab confirmation path correctly.
- `help/keys.md`, which already states the blocked shortcut and `Cmd+F` behavior correctly.
- Other help pages or user-documentation pages that do not describe this refusal path.
