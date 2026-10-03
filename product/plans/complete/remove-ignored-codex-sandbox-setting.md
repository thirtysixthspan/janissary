# Remove the ignored Codex sandbox setting

**Complexity: 1/10**. The warning comes from one unsupported key in the standard configuration copied by project initialization.

## Goal

Stop the standard Codex configuration from producing the ignored `sandbox_permissions` setting warning in this repository and projects initialized from it.

## Approach

Remove `sandbox_permissions = []` from `.codex/config.toml`. Keep the supported approval and sandbox settings and the existing environment filters. Project initialization already copies the standard configuration on every run, so it needs no implementation change.

The [official Codex configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference) documents `approval_policy` and `sandbox_mode` and has no `sandbox_permissions` configuration key.

## Implementation steps

1. Remove the unsupported configuration entry and run the diff-scoped checks.
2. Add initialization regression tests for a fresh project and a project with the old setting, then run the diff-scoped checks.
3. Update the CLI spec, complete this plan, remove the resolved backlog entry, and run the diff-scoped checks before shipping.

## Tests

- A fresh project receives the existing approval and sandbox defaults without `sandbox_permissions`.
- Refreshing a project whose configuration contains `sandbox_permissions` removes that setting and preserves the standard approval and sandbox defaults.

## Spec updates

- Update `product/specs/cli.md` to describe initialization and refresh without the ignored-setting warning.

## Docs

No public documentation change is needed. Help does not describe this key, and the existing project-creation page already explains that rerunning initialization refreshes standard configuration files.

## Out of scope

- Changing approval, sandbox, environment, or harness launch policies.
- Editing other workspaces or user-level Codex configuration.
- Changing how initialization copies configuration files.
