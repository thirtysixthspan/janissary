# Keep optional OAuth staging failures from failing workspace launches

**Complexity: 5/10.** Add an explicit preparation result, atomic publication, and a bounded notice through existing local notification and remote readiness paths.

## Goal

An optional OpenCode credential write that fails does not stop a workspace, shell, other harness, or API-key-authenticated process from starting, and incomplete credentials never install a data-home redirect.

## Approach

The preceding security fix moved all credential writes into provisioning. Keep scratch-root allocation mandatory and exclusive, but treat private OAuth preparation as optional. Write the full credential into an exclusive owner-only staging file, then publish the completed file atomically without following or replacing an existing final file. Clean up failed staging before any workspace child starts. Return an explicit available, absent, or failed result; distinguish unsafe paths from ordinary storage failures. A fixed credential-specific notice reports failure without raw exception text or credentials.

Carry the notice through the existing provisioning handle and workspace readiness object. A narrow callback on `WorkspaceManager`, wired in `src/controller/create-managers.ts`, sends the local notice through the established notification service. Remote provisioning includes the same bounded notice in its existing readiness notice, and the common remote launch callback reports that credential failure for both shells and harnesses. No new wire message or sandbox permission is needed. Spawn preparation remains read-only and preserves ambient data-home settings and API keys when there is no completed OAuth copy.

## Implementation steps

1. Update `src/sandbox/opencode-data.ts` for atomic staging and an explicit result, and `src/workspace/scratch.ts` for optional failure notices. Update the provisioning types and lifecycle in `src/workspace/index.ts` and `src/workspace/manager.ts`, wire local notifications in `src/controller/create-managers.ts`, and carry/report remote notices in `src/remote/serve-provision.ts` and `src/harness/remote-launch.ts`. Add the tests below. Run `./scripts/run.mjs check-diff`.
2. Update `product/specs/workspaced-agent.md` and the existing authentication explanation in `documentation/user-documentation/advanced-agents/tokens.md` to describe failure without a redirect or failed launch. Run `./scripts/run.mjs check-diff`.
3. Promote this plan, remove only the staging-failure entry, verify, and push a new commit to PR #1671. Leave its description and title unchanged.

## Tests

- A regular-file destination collision returns an unsafe-path failure without writing through it.
- Directory-creation and partial-write failures return bounded storage failures, remove incomplete output, and permit a later legitimate preparation before child launch.
- Failed optional staging leaves workspace scratch usable and shell/Claude launches retain their normal commands, ambient data home, and provider keys.
- Missing source OAuth is an absent result, not an error notice.
- Workspace readiness resolves and reports one local credential notice only after provisioning; closed workspaces report none.
- A failure delivering the optional notice cannot reject workspace readiness.
- The controller's workspace callback uses the established notification service.
- Remote provisioning completes and carries the credential notice; the common remote launch path reports it without failing readiness.
- Existing containment, refreshed-credential, browser, and transcript tests remain passing.

## Out of scope

Scratch-root allocation failures, refreshing credentials, re-seeding after children start, JWT validation, and transcript storage injection. No new notification category, remote protocol, sandbox permission, dependency, or code comments.
