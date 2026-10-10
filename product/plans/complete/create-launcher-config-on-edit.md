# Create the launcher config when opening it

**Complexity: 4/10** — the configure intent already knows the effective project or home path, and the launcher already owns the canonical default command list. A focused configure module will create the file before dispatching the existing editor command, including the missing parent directory and a race-safe no-overwrite write; the extraction also keeps the activation module within the repository's 200-line limit.

## Goal

When the Configure button targets a missing `launcher.json`, create it with the launcher's default commands before opening it in the editor.

## Approach

Add a launcher config helper that creates parent directories, serializes the canonical defaults in the same shape as `janus init`, and uses exclusive file creation so a file that appears concurrently is never overwritten. Put the configure action in a focused module and call it from the intent before dispatch. Existing files, including malformed ones, remain untouched.

## Implementation steps

1. Add and test a helper that creates a missing config file with default command entries and does not replace an existing file.
2. Extract the configure action into `configure.ts`, invoke file creation before dispatching the editor command, and cover that ordering in an activation test.
3. Update the launcher spec to describe first-open file creation.

## Tests

Add coverage to `src/plugins/launcher/commands-file.test.ts` for default serialization, parent directory creation, and preserving an existing file. Extend `src/plugins/launcher/activate.test.ts` to verify the configure intent has created the file before it dispatches `edit`.

## Out of scope

- Rewriting malformed or unreadable configuration files.
- Changing which project or home file takes precedence.
- Changing command defaults or editor dispatch behavior.
