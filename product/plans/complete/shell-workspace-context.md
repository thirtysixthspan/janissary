# Preserve shell workspace ownership

**Complexity: 5/10.** Existing tab state and workspace reference counting cover the lifecycle.

## Goal

A shell retains its source workspace and host-owned directory and offline mode, including after the source closes.

## Approach

Bind terminal creation to the source tab's host context. Copy that context onto terminal-owning plugin tabs and retain their workspace once. Keep payload fields informational. Completion and metadata actions resolve the addressed tab.

## Implementation

1. Bind factory terminal resources to host context, initialize terminal-owning tabs, and retain their workspace. Update completion and metadata actions to use that context.
2. Add regression tests for workspace retention, nested shells, failed factories, nonterminal tabs, addressed completion, and metadata actions.
3. Update the shell spec and existing user documentation where needed, then remove the resolved backlog entry.

## Tests

Run diff-scoped checks after each step. Cover source close with a surviving shell, nested workspace/offline inheritance, no retention on failed or nonterminal factories, completion from a nonselected shell, and metadata new-agent/file navigation using its cwd.

## Out of scope

Terminal attachment authorization, live cwd reporting, keyboard focus, and picker rendering belong to separate backlog entries. No new code comments are needed.
