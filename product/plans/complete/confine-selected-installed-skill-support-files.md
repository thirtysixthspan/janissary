# Confine selected installed skill support files

**Complexity: 3/10** — The sandbox already supports narrowly carved-in installed skill directories; the autonomous local ACP path only needs to pass the selected installed skills through.

## Goal

Let a locally confined autonomous agent read companion files from selected installed skills while leaving unselected skills and unrelated installation files denied.

## Approach

Add an optional installed-skill directory list to ACP options. Derive it from the immutable launch snapshot, accepting only selected Janissary skills whose resolved files remain under the canonical installed `skills/` root. Forward the directories to the existing sandbox option, which already validates containment and binds literal and real paths before the final secret-deny rules.

## Implementation steps

1. Add the installed-skill directory field to `AcpOptions` and pass it through `connectAcp` to `sandboxSpawn`.
2. Derive selected installed skill directories in local autonomous agent execution from the captured skill snapshot, filtering by source and canonical path containment.
3. Add focused ACP integration coverage for propagation and sandbox tests for selected support-file access, rejection of unselected or unrelated paths, and secret-deny ordering.
4. Update the agent command spec to state that selected installed skills' support files are readable during confined local execution.

## Tests

The documented coverage covers local autonomous ACP supplying only selected installed skill directories, `sandboxSpawn` accepting only directories under the installed skills root, the generated read carve-in remaining before the secret deny, and unrelated install paths remaining absent.

## Out of scope

Do not change task discovery, skill resolution or grants, project-skill access, remote execution, sandbox containment rules, or secret-deny behavior.
