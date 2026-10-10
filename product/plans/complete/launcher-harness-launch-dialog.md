# Launcher harness launch dialog

**Complexity: 3/10** — the dispatch path exists; add focused regression coverage and clarify the spec.

## Goal

Choosing the launcher's built-in Harness command opens the New harness dialog.

## Approach

The built-in launcher entry already names the bare `harness` command, the launcher activation dispatches the configured line, and the command manager opens the dialog for bare `harness`. Pin the launcher UI and activation handoff so those existing pieces stay connected, then state the behavior in the launcher spec.

## Implementation steps

1. Add a launcher client test that confirms the built-in Harness row dispatches its `harness` id.
2. Add a server activation test that resolves the Harness id to the bare `harness` command.
3. Update `product/specs/launcher.md` to say the built-in Harness entry opens the New harness dialog.
4. Run `./scripts/run.mjs check-diff`.

## Tests

- Confirming the Harness row sends the launcher `run-command` intent with id `harness`.
- The launcher server resolves that id to the bare `harness` command, whose command behavior is already covered by `src/command/manager.test.ts`.

## Out of scope

- Changing the launcher's two-click command-row interaction.
- Changing how the harness launch dialog or harness command works.
