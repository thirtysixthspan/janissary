# Give built-in fixed subcommand forms their own rows

**Complexity: 3/10**

## Goal

Let a user or script disable one fixed subcommand form of a built-in command, such as `tab dock`, without disabling the whole parent command.

## Approach

Expand each built-in declaration whose first form is its own name into a parent row holding only that form, plus one child row per remaining fixed form. Each child row's name is the full form and its parent is the command, the same parent link the native ACP children already use. The shared-name rows `ask reset`, `tell reset`, and `search transcript`, and the `question` declaration whose forms are native rows, are left as they are.

## Implementation steps

1. Add a row-expansion helper in `src/application-commands.ts` and use it when listing built-in rows.
2. Update the specs for the inventory.

## Tests

- Inventory: child rows, their parent links, `db sqlite query` parented to `db sqlite`, and `resolveApplicationCommand('tab dock x')` returning the `tab dock` row.
- Manager: disabling `tab dock` leaves `tab focus` and `tab` enabled; disabling `tab` disables `tab undock`.
- Completion policy: only the disabled form is refused.
- Disabled-command projection lists the parent and child rows.

## Out of scope

- Per-form agent access, and any change to the client matcher or the Commands tab, which already handle parent links.
