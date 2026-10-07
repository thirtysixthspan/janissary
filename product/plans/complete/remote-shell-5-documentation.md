# Document standalone remote shell launches

**Complexity: 3/10** — update existing command help, user guides, and the plugin API reference to match the standalone remote shell behavior already shipped in this PR.

## Goal

Explain `zsh … on <address>` to users and document the optional remote launch fields for bundled plugin authors, without changing runtime behavior or the v1 API version.

## Approach

Use the shell feature plan and `product/specs/shell-tab.md`, `product/specs/remote-server.md`, and `product/specs/tab-plugins.md` as the behavior source. Keep user documentation focused on commands and observable behavior; describe API field timing and compatibility in the developer reference.

## Implementation

- Update the `zsh` row in `help.md` with remote syntax, workspace provisioning, ready and failure behavior, and the nested remote launch refusal.
- Update `documentation/user-documentation/command-bar/shell.md` to replace the stale refusal and describe remote shell provisioning, prompt input, queueing, ready notification, and failures.
- Add a standalone remote shell section to `documentation/user-documentation/advanced-agents/remote-agents.md`, including the local-origin restriction and a link to the shell command guide.
- Document `remote.address`, `connectPtyId`, and `host` in `documentation/developer-documentation/tab-plugins.md`, including the factory and ready lifecycle and an additive v1 changelog entry.
- Keep the text aligned with existing shell and remote behavior specs.

## Tests

- Run `./scripts/run.mjs check-diff` to verify changed files and affected projects.
- Confirm the four required documentation pages describe the supported command and the plugin reference names all three fields and their lifecycle.

## Out of scope

- Runtime behavior or API type changes.
- The separate test coverage and remote-server spec findings recorded on this PR.
