# Keep task-picker keystrokes out of the command line

**Complexity: 2/10** — the task picker's existing keyboard dispatcher needs to cancel browser defaults for keys it does not use.

## Goal

While the task picker is open, ordinary typing and other unused key presses must not change the command line beneath it. The picker's navigation, selection, and close keys continue to work.

## Approach

The task picker already has priority in the global overlay keyboard dispatcher, but its key adapter only prevents the browser default for keys used by task navigation. Prevent the default before filtering for handled keys. Unrecognized keys then remain no-ops in the picker and cannot be inserted into the focused command line.

## Implementation steps

1. Update `dispatchTaskPickerKey` to prevent the default for every key while the picker is active, while retaining its current handling of navigation, Enter, and Escape.
2. Add focused tests proving an unused printable key is default-prevented without changing the selection, and that existing task-picker actions still run.
3. Update `product/specs/task-picker.md` to specify that unused key presses do not reach the command line.

## Tests

- `web/src/pickers/task-picker-keys.test.ts`: an unhandled printable key is default-prevented and does not call selection or action callbacks.
- `web/src/useWindowKeys.test.ts`: with the task picker open, an ordinary key is claimed and default-prevented rather than falling through to other global behavior.
- Existing task-picker key dispatch cases continue to verify navigation, picking, and toggling.

## Out of scope

- Changing which keys navigate or activate task rows.
- Changing command-line behavior for other pickers or when the task picker is closed.
- Updating help or public documentation unless they already describe this key behavior.
