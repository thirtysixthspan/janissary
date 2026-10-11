# Keep OAuth provisioning inside a new workspace's scratch directory

**Complexity: 6/10.** Move one optional credential write from the spawn path into the existing workspace readiness lifecycle, validate scratch lookups, and cover hostile path substitutions without adding a transport or sandbox permission.

## Goal

Workspace children cannot cause the application to create an OAuth file outside their private scratch directory, and later launches cannot re-seed credentials after a child deletes or redirects them.

## Approach

Allocate the workspace scratch root exclusively during provisioning and seed OAuth synchronously before the workspace readiness promise resolves. At this point no child belonging to that workspace has started, so it cannot swap a checked ancestor between directory creation and the credential write. An existing scratch root is refused rather than adopted as a trusted directory. Later spawn preparation becomes read-only: it validates the literal scratch root, both OpenCode directories, and the existing auth file without accepting symbolic links. The resolved directory is returned only after containment validation. Existing refreshed credentials remain untouched, and deleting credentials never triggers another application-side write. The existing workspace readiness and reference lifecycle owns this operation; no new global workspace registry is needed.

## Implementation steps

1. Add `src/workspace/scratch.ts` to allocate scratch roots and seed credentials before readiness. Call it from `src/workspace/index.ts`. Harden `src/sandbox/opencode-data.ts` for exclusive initial allocation and safe read-only lookup. Change `src/sandbox/environment.ts` and `src/sandbox/index.ts` to pass the intended workspace path into lookup rather than seed during a spawn. Adapt the existing OAuth staging tests to provision explicitly, and add security and real provisioning regression tests. Run `./scripts/run.mjs check-diff`.
2. Update the authentication behavior in `product/specs/workspaced-agent.md` and `product/specs/sandbox.md`, and qualify the existing startup/provisioning explanation in `documentation/user-documentation/advanced-agents/tokens.md`. Run `./scripts/run.mjs check-diff`.
3. Promote this plan, remove only the symlink finding from `product/backlog/pull-request.md`, verify, and publish a new commit to PR #1671 without editing its description or merging it.

## Tests

- Workspace readiness includes the private OAuth copy, using fake credentials and fixtures inside the project.
- Initial scratch allocation rejects an existing or symlinked root without writing to its target.
- Lookup rejects links at the scratch root, data directory, OpenCode directory, and auth file, including broken links.
- A workspace that deletes or redirects its credential tree and then launches another process cannot cause the application to create or modify any host fixture file.
- Later launches preserve refreshed credentials, and distinct workspaces retain distinct copies.
- Owner-only permissions, API-key injection, absent OAuth, browser exclusion, and workspace cleanup continue to pass.

## Spec and documentation updates

Describe provisioning before child launch, safe lookup, and the absence of re-seeding after removal. Preserve the existing rules for host-local remote credentials and independent API-key injection.

## Out of scope

Destination-error recovery and notifications belong to the next recorded finding. JWT syntax validation and transcript environment injection belong to their own findings. No new sandbox carve-ins, remote credential forwarding, source credential writes, or code comments.
