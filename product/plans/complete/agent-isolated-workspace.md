# Run local agent tasks in an isolated workspace

**Complexity: 8/10** — Local execution must provision and release an asynchronous workspace while preserving caller identity, cancellation, snapshots, borrowed workspace leases, and the existing remote path.

## Goal

Run local agent tasks against a fresh workspace clone by default so task and skill snapshots and ACP file access use the same isolated project state, without changing the caller's directory or remote execution behavior.

## Approach

Create the run before workspace provisioning and register cancellation and release as soon as the tracked workspace directory is known. Wait for provisioning before resolving task and skill files. Keep the captured caller context unchanged, and supply the execution directory separately to ACP and run monitoring. Reuse a tracked workspace only when the caller already runs from one; otherwise provision a fresh clone. Report when the local execution directory cannot be sandbox-confined.

## Implementation steps

1. Allow a run to receive its resolved snapshot after provisioning while retaining the caller's original identity and execution workspace metadata.
2. In the local `agent` command path, borrow only a tracked caller workspace or provision a new workspace, register cancellation and release before awaiting readiness, then resolve the snapshot from that directory. Leave remote resolution and leases unchanged.
3. Pass the execution directory as both `cwd` and `workspaceDir` to local ACP; report the sandbox-disabled notice through notifications when the local execution workspace cannot be confined.
4. Add command, task-resolution, and workspace lifecycle tests for fresh-clone resolution, ignored caller task edits, borrowed reference cleanup, provisioning failure, cancellation, and cleanup failures.
5. Update the agent command spec and existing user guide to distinguish caller context from the local execution workspace.

## Tests

Verify that a task and skill present only in the provisioned clone resolve after readiness, caller-directory content is ignored, ACP receives the cloned execution directory, provisioning cancellation happens before the result settles, tracked borrowed references release once, and cleanup failures remain warnings without replacing task outcome. Cover the local sandbox notice's enabled, disabled, and unavailable conditions. Keep remote snapshot resolution, ACP target, and remote lease tests passing.

## Out of scope

Do not change remote workspace selection or protocol behavior, nested-agent policy, tab-creation ownership, local task resolution confinement rules, or unrelated PR backlog items.
