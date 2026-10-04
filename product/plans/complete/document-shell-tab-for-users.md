# Document the shell tab for users

**Complexity: 3/10** — update the existing shell guide, application-command reference, and keyboard reference to cover the bundled `zsh` tab already described by the in-app help and functional spec.

**Goal.** A reader of the documentation site can discover the `zsh` shell tab and understand its output-only terminal, command routing, workspace start, history, and control keys.

**Approach.** Add a clearly separate shell-tab section to the existing shell guide so it is not confused with transcript shell commands. Link the `zsh` entry from the application command reference and document its shell-specific keys in the keyboard guide. Keep the wording aligned with `product/specs/shell-tab.md`.

## Implementation steps

1. Add the `zsh` shell-tab behavior to `documentation/user-documentation/command-bar/shell.md`.
2. Add `zsh` to `documentation/user-documentation/command-bar/commands.md` and add the shell-specific history and control keys to `documentation/user-documentation/getting-started/keyboard.md`.
3. Run the VitePress production build and verify the new internal links resolve.

## Tests

- `npm run docs:build` completes successfully with the new guide and links.
- Review the new behavior text against `product/specs/shell-tab.md`.

## Out of scope

- Adding a separate shell-tab page or changing the documentation site's navigation.
- Changing the in-app `help.md`, which already documents the `zsh` command and its routing.
