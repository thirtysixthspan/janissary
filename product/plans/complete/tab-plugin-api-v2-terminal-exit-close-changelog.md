# Add the terminal-exit close argument to the API v2 changelog

**Complexity: 1/10** — a documentation-only clarification of an existing API v2 contract.

## Goal

Record in the tab-plugin API v2 changelog that the existing client `close` callback accepts the optional `{ terminalExited: ptyId }` argument for verified process exits. State that this is additive, leaves `TAB_PLUGIN_API_VERSION` unchanged, and preserves zero-argument `close()` as the normal user-close path.

## Approach

Add one concise bullet under `## API changelog` / `### v2` in `documentation/developer-documentation/tab-plugins.md`. Match the client-contract paragraph above and the existing behavior in `product/specs/tab-plugins.md`; no behavior or spec changes are needed because the spec already describes the argument and its verified-exit semantics.

## Implementation steps

1. Confirm PR #1729 is open on its recorded branch and prepare the branch dependencies with the required lockfile audit.
2. Verify the existing client contract and product spec, then add the v2 changelog entry without changing adjacent documentation.
3. Run the diff-scoped check, promote this plan to `complete`, and remove only the selected first entry from `product/backlog/pull-request.md`.
4. Commit and push the changes to the same PR branch, then confirm the PR remains open at the published head.

## Tests

No new tests apply because the change documents existing behavior and changes no code. Run `./scripts/run.mjs check-diff` after each repository change.

## Out of scope

- Changing the callback implementation, API version, or product behavior.
- Revising the already-consistent product spec or unrelated documentation.
- Resolving the remaining PR backlog entry or changing the PR description.
