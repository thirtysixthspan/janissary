# Clarify shared file navigator restore comments

**Complexity: 1/10** — this is a comment-only correction in three existing source files.

## Goal

Describe the shared restore hint and selection-request callers accurately for both profile and `files` command flows.

## Approach

Keep behavior unchanged. Update only the comments named in the backlog proposal after verifying the profile and command call paths. The file-navigator spec already describes both restore flows and their different selection semantics, so it needs no change.

## Implementation steps

1. Update the `FileNavigatorView.restore` comment to cover profile and command restores without claiming it is absent from every tree not launched from a profile.
2. Update the request-purpose comments in `src/file-navigator/selection-request.ts` and `src/bus.ts` to name both `profile save` and `files print`.
3. Remove only this resolved entry from `product/backlog/pull-request.md`.

## Tests

No tests were added because the change was comments only and did not change behavior. Existing restore and selection-request tests cover the referenced paths, and the diff-scoped checks passed.

## Out of scope

- Changing restore behavior or adding tests that duplicate existing coverage.
- Editing comments outside the three files named by the backlog entry.
