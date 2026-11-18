# Name run-clone as a later extension in the protocol version comment

**Complexity: 2/10** — ~5 added comment lines, 1 edited production file, 4 requirements, 3 existing verification scenarios (p=3.91).

## Goal

Record in the comment above `REMOTE_PROTOCOL_VERSION` that version 44 opens the feature's single unreleased protocol version, and that the later run-clone frames and workspace-selector frames extend this same version and comment without another increment — phrased as not yet implemented, so a future implementer meets the single-increment rule where they would otherwise bump the constant again.

## Approach

The version-44 paragraph of the explanatory comment in `src/remote/protocol.ts` currently describes only `acp-session-started` and stops. Extend that paragraph in place to add the single-unreleased-version rule: 44 is the feature's one unreleased version, and the run-clone frame pair and the workspace-selector frames are later, not-yet-implemented extensions of that same version and comment that require no further increment. This is a comment-only edit: the constant's value, the handshake functions (`encodeHandshake`, `parseHandshake`), and the exact-version/parked-peer logic in `src/remote/serve-detach.ts` are untouched. Because comments are excluded from the ESLint counted-line total, this does not push `protocol.ts` past the 200-line limit.

## Implementation steps

1. Append to the version-44 comment paragraph in `src/remote/protocol.ts` (above `export const REMOTE_PROTOCOL_VERSION = 44;`) sentences stating that 44 opens the feature's single unreleased protocol version, that the later run-clone frames and workspace-selector frames extend this same version and comment without another increment, and that those frames are not yet implemented. Change only the comment — no constant, no frame, no handshake logic.
2. Confirm no code path changed: the pinned literal test asserting 44 in `src/remote/protocol.test.ts` and the exact-version handshake and parked-peer version refusal in `src/remote/serve-detach.ts` remain passing and untouched. Run `$janissary/scripts/run.mjs check-diff` and resolve any failure before proceeding. Local socket tests in `src/index.test.ts` may fail with EPERM in this sandbox; that is environmental, not a regression from this change.
3. Complete the plan, remove the resolved backlog entry from `product/backlog/pull-request.md` (restoring the master comment-and-heading skeleton), verify, and publish to the same PR branch.

## Tests

No new tests: a comment-only change adds no behavior to cover. Verification is that existing tests remain green under `check-diff`:

- `protocol.test.ts` "protocol version" literal `is 44` assertion, plus the exact-version handshake and earlier-version refusal cases.
- `serve-detach.ts` exact-version handshake and parked-peer version refusal, covered by their existing tests.

## Out of scope

- Changing `REMOTE_PROTOCOL_VERSION`'s value or any handshake, codec, frame, or parked-peer logic.
- Adding run-clone frames, workspace-selector frames, or claiming they are implemented anywhere in code.
- Editing `product/specs/remote-server.md`: it keeps describing version 44 as `acp-session-started` only and makes no run-clone/selector support claim, which stays consistent with the comment's "not yet implemented" phrasing.
- Documentation, help pages, and any other file changes.
