# Profile Picker Replaces Its Owning Bar Draft

Complexity: 6/10

## Goal

Make a profile selection replace the command draft in the bar that opened the picker, including a docked shell, without submitting the command or redirecting it if that owner has closed.

## Approach

Add a per-tab whole-line replacement registry alongside the existing task picker insertion registry. Scope its registration through the app command-bar context, register a handler from the shell tab that replaces its draft and focuses its input, and carry the picker owner to the profile selection callback. Keep direct harness PTY delivery for owners without a command bar.

## Implementation steps

1. Add replacement registration and identity-safe cleanup to `web/src/shared/command-bar/app-command-bar-scope.ts`, and expose the scoped registration through `AppCommandBar` in `web/src/shared/command-bar/AppCommandBar.tsx`.
2. Own the replacement map in `web/src/App.tsx` and assemble its scoped callback in `web/src/useAppCommandBarState.ts`.
3. Register the shell's replacement handler in `web/src/plugins/shell/useApplicationBarEdits.ts`, replacing the full draft and focusing the input without submitting.
4. Pass the recorded profile-picker owner through `web/src/pickers/usePickerOverlays.ts` and `web/src/pickers/usePopulatePickers.ts` into `web/src/pickers/useProfilePicker.ts`. Replace the global recall path in `web/src/pickers/populate-command-line.ts`; a closed recorded owner must not fall back to the current tab. Preserve harness PTY delivery.
5. Extend the picker, registry, and shell tests for current and docked shell replacement, focus, registration cleanup, no submission, and a closed owner.
6. Update `product/specs/profiles.md`, `product/specs/shell-tab.md`, and `documentation/user-documentation/automation/profiles.md` to describe where profile selection lands and how it behaves if the owner closes.

## Tests

- `web/src/pickers/useProfilePicker.test.ts`
- `web/src/pickers/usePickerOverlays.test.tsx`
- `web/src/shared/command-bar/app-command-bar-scope.test.ts`
- `web/src/plugins/shell/ShellTab.test.tsx`
- Run `./scripts/run.mjs check-diff` after implementation and test changes.

## Out of scope

- Changing task picker caret insertion or queue editing.
- Submitting the selected profile command automatically.
- Changing harness PTY command delivery.
