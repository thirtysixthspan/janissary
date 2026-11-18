# Reconcile the remote run-clone spec with the subagent command

**Complexity: 1/10** — prose-only spec edit: 0 production lines/files, 0 requirements, 0 scenarios, 0 new units (p=1.58).

The Run clones section in `product/specs/remote-server.md` closes by saying an `acp-open` or `agent-resolve` request may name a ready clone with a `workspace` selector, but that no launcher or command exposes the service for a run yet. That denial is stale: this same branch ships the `subagent` command, which provisions and releases a run clone for every remote subagent run. A reviewer trusting the spec can conclude the run-clone frames are unused scaffolding and later remove the service while the command still depends on it.

## Goal

Bring the closing claim of the Run clones section in line with the shipped `subagent` command and the sibling `subagent` spec, so the remote spec no longer denies that a command uses the run-clone service.

## Approach

One clause substitution in the closing paragraph of the Run clones section. The stale tail, "but no launcher or command exposes the service for a run yet", is replaced with a statement that the `subagent` command is the command that provisions and releases a run clone for each remote subagent run, and that `acp-open` and `agent-resolve` select that clone by its label for spawn, confinement and task resolution. Every other sentence in the section stays byte-for-byte unchanged.

Verified against the code before acting:

- `src/subagent/launch.ts` prepares a remote subagent workspace from the channel and caller label, resolves the task with the `subagent-<run id>` label, and passes the same label as the remote execution workspace.
- `src/subagent/remote-workspace.ts` sends `runClone('create', ...)` and `runClone('release', ...)` with that label and ties the release to the run's lease.
- `src/remote/serve-run-clones.ts` implements the named create and release service.
- `product/specs/subagent.md`'s Remote clone lifecycle section already describes provisioning and releasing a remote clone for each run.
- Earlier in `product/specs/remote-server.md`, the ACP-open and agent-resolve paragraphs already describe the `workspace` selector choosing a ready clone for spawn, confinement and task resolution by label.

No code, frame, protocol version, command behavior, other spec or documentation change.

## Implementation steps

1. Edit the closing paragraph of the Run clones section in `product/specs/remote-server.md`, replacing the stale last clause with the corrected statement.
2. Re-read the edited paragraph and the sibling ACP-open, agent-resolve and subagent Remote clone lifecycle passages to confirm the wording matches shipped behavior.
3. Run `$janissary/scripts/run.mjs check-diff` (spec-only change; expected to have nothing scoped to lint or test).

## Tests

None — no code changed. Verification is re-reading the edited section and cross-checking it against `product/specs/subagent.md`, `src/subagent/launch.ts` and `src/remote/serve-run-clones.ts`.

## Out of scope

- Any code change, frame, protocol version or command behavior.
- The other pull-request backlog entry, which stays byte-for-byte unchanged.
- The pull request's title and description — the entry names no description correction.
- `help/` and `documentation/user-documentation/` pages; none describe this internal run-clone claim.
