# Preserve remote file identity across navigator roots

Complexity: 5/10 (threshold: 7).

## Goal

Keep distinct remote files distinct in the local cache and preserve the destination of a read or create while the navigator changes its root.

## Approach

Use the normalized absolute remote path as the file identity within the existing host/workspace cache directory. Hash that identity into a directory and retain the basename for opener selection. Capture root, filesystem, and workspace identity before asynchronous work begins. Deferred-promise test fixtures may carry the existing ES2023 lint compatibility annotation.

## Implementation steps

1. Update `src/file-navigator/remote/file-cache.ts` and `src/file-navigator/manager/files.ts` together with their tests. Validate relative paths before hashing, retain workspace cleanup, and snapshot each request's destination before awaiting it. Adapt existing path assertions to the new internal layout.
2. Update `product/specs/remote-server.md` and the existing remote editing paragraph in `documentation/user-documentation/advanced-agents/remote-agents.md`. No help command changes are needed.
3. Complete this plan and remove only the resolved backlog entry.

## Tests

Add cases for distinct files with the same relative name at different roots, the same file reached through different roots, and saves from both editors reaching the right root. Add deferred open and create tests proving a root/port change cannot rebind the pending result. Retain traversal rejection, orphan-save refusal, and workspace cleanup tests. Run `./scripts/run.mjs check-diff` after each implementation step.

## Out of scope

Remote stale-write detection, host/workspace identity changes, symlink canonicalization, and changes to other backlog entries.
