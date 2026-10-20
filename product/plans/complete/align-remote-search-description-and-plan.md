# Align the remote search description and feature plan

**Complexity: 2/10** — update two intent documents to describe the remote search implementation already shipped, with no runtime change.

## Goal

The pull request body and the main workspace-scoped search plan describe remote search as transferring candidate files for local matching. The implementation instead sends one `search-text` request to the remote workspace and returns capped matching rows. The main plan also omits that capability and has a stale capability total.

## Approach

Keep `product/specs/search-tab.md` as the behavioral source, since it already says matching runs remotely and the completed result set appears after the remote scan. Correct the pull request's capability summary and remote-search design paragraph, then bring the main feature plan's design decisions, capability list, scope file access, scan behavior, and capability-count references into line with `product/plans/complete/remote-search-runs-on-host.md` and the implementation. Preserve the intentional tradeoff that remote results arrive together after the scan completes.

## Implementation steps

1. Update the main feature plan's stale remote-search decision, capability and manifest lists, scope access, scan integration, test descriptions, and capability total. Move this plan from `draft/` to `ready/` once its wording is final.
2. Update only the related PR body passages: name `remoteWorkspaceSearch` among host capabilities, describe the remote search operation in the server overview, and replace the local-transfer architecture paragraph with host-side matching and one capped response. Preserve all unrelated text in the body.
3. Move this plan from `ready/` to `complete/` and remove the resolved pull-request backlog entry, preserving the remaining entry.

## Tests

No runtime behavior changes. Run `./scripts/run.mjs check-diff` after each plan or source-document change. The existing `src/plugins/documentation.test.ts` checks the declared capability count against the developer documentation; it must pass unchanged.

## Spec and documentation

`product/specs/search-tab.md` and `documentation/developer-documentation/tab-plugins.md` already describe the remote-host operation and the forty-seven-capability contract. No changes are needed there.

## Out of scope

Changing the remote search operation, result ordering, streaming behavior, protocol, user documentation, or the pull request's title and unrelated description text.
