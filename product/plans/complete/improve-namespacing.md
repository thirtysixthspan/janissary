# Plan: Extend Namespacing to Existing Directories

**Complexity: 2/10** — a small workflow-documentation correction with no application-code behavior change.

## Goal

Update `ai/tasks/improve-namespacing.md` so a namespace move may add related flat files to an existing `src/<prefix>/` directory, while preserving the task's mechanical move, import-rewrite, and verification safeguards.

## Approach

Clarify that the target namespace may already exist, require the task to inspect and preserve the existing namespace contents, and replace the existing-directory block with collision and relationship checks. Update the inventory and move instructions so they work for both newly created and already-existing directories, including any number of related files selected for an existing namespace.

## Implementation steps

1. Update the namespacing task's scope, candidate-selection rules, inventory guidance, and move recipe for existing namespaces.
2. Run `./scripts/run.mjs check-diff` after the task-file edit.
3. Promote this plan, remove the corresponding backlog issue, run the diff check again, and merge through the prescribed PR workflow.

## Tests

No runtime tests apply because this change only updates an internal task document. Run `./scripts/run.mjs check-diff` after each edit and confirm the repository's existing baseline remains clean.

## Spec and documentation

No functional spec, `help.md`, or public user documentation applies; application behavior is unchanged.

## Out of scope

- Moving or renaming any source or test files.
- Changing the namespace move algorithm beyond supporting an existing target directory.
- Adding a new application feature or user-facing behavior.
