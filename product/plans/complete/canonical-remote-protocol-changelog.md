# Keep one canonical remote protocol changelog

**Complexity: 2/10** — ~16 added comment lines in 1 production file, 5 documentation requirements and 2 test scenarios, no new units (p=4.16).

## Goal

The version history written as a comment beside `REMOTE_PROTOCOL_VERSION` in `src/remote/protocol.ts` is meant to be the one narrative of what each exact-version handshake bump protects. It currently has two concrete errors: it skips version 34 entirely (a version-33 entry is followed straight by version 35) and it describes version 47 twice, with the second block still calling 47 "this feature's single unreleased protocol version" even though version 48 now exists. A second, older narrative lives above the older-version handshake test in `src/remote/protocol.test.ts`, where it assigns the `identity` field to version 9 and the `git-pull` operation to version 8 — both off by one from the module, which records `git-pull` as 9 and `identity` as 10. An engineer bumping the version therefore reads two disagreeing stories about the gate that refuses mismatched peers, and can misjudge which peers a bump locks out.

## Approach

Make the comment beside `REMOTE_PROTOCOL_VERSION` the single source of the version history. Repair its two errors: add the missing version-34 entry (the `search-text` filesystem operation that runs a text search on the remote host and returns only capped matching rows), and fold the two version-47 paragraphs into one entry that keeps both its subjects — `acp-session-started` and the grouped run-clone/workspace-selector additions — while correcting the stale "unreleased" language now that version 48 exists. Replace the conflicting narrative in the test with a short pointer to the module's history, and add an assertion beside the existing pinned-version test that fails if the history omits the current version, so a future bump cannot forget the prose. The same stale "47 is unreleased" fact also appears in `product/specs/remote-server.md`; correct that one sentence so the spec no longer contradicts the repaired history. No wire behavior, constant, frame, or refusal wording changes.

## Implementation

1. In `src/remote/protocol.ts`, insert a version-34 entry between the version-33 and version-35 paragraphs describing the `search-text` operation: it searches on the far side and returns capped matching rows instead of transferring candidate file contents for local matching, and a version-33 peer refuses the unknown operation. Keep the existing version numbering and the exact-version handshake reasoning consistent with the surrounding entries.
2. In the same file, merge the two consecutive "Version 47" paragraphs into one entry: keep the `acp-session-started`/`acp-ready.sessionId` account and the note that the frame is server-only, keep the run-clone and `workspace` selector account and the reason they share one bump, and correct "unreleased" so 47 is no longer described as unreleased now that version 48 follows it.
3. In `src/remote/protocol.test.ts`, replace the multi-line narrative comment above the "rejects a remote speaking older protocol version" cases with a short pointer to the history beside `REMOTE_PROTOCOL_VERSION` in `protocol.ts`.
4. In the same test file, add `readFileSync` from `node:fs` and, beside the `describe('protocol version')` pinned-version assertion, add an assertion that reads `protocol.ts` via `new URL('protocol.ts', import.meta.url)`, takes the text before the version constant, and requires it to contain `Version ${REMOTE_PROTOCOL_VERSION}`.
5. In `product/specs/remote-server.md`, change the sentence that calls version 47 "one unreleased version for the whole feature set" so it reflects that version 48 has since taken the next bump, leaving the rest of that paragraph as it is.
6. Run `$janissary/scripts/run.mjs check-diff` after each step.

## Tests

- `src/remote/protocol.test.ts`: the new `describe('protocol version')` case asserts the source changelog mentions the current version, so bumping `REMOTE_PROTOCOL_VERSION` without updating the prose fails; the existing pinned-version case (`is 48`) stays as it is.
- The whole existing `src/remote/protocol.test.ts` suite, including the older-version handshake cases under their shortened pointer comment, must pass unchanged in behavior.

## Out of scope

- Changing `REMOTE_PROTOCOL_VERSION`, any frame type, codec, or handshake behavior.
- Editing `src/remote/serve-detach.ts` or the relay tests — they read the constant, not the comment.
- Rewriting the history for versions other than 34 and 47, or adding a history for versions below the ones already documented.

## Verification

- `$janissary/scripts/run.mjs check-diff` passes.
- The version history in `src/remote/protocol.ts` has exactly one entry per version from the lowest documented version through 48, with version 34 present and version 47 appearing once and no longer called unreleased.
- `src/remote/protocol.test.ts` contains no second version narrative and its new assertion fails if the current version is absent from the source history.
- `product/specs/remote-server.md` no longer calls version 47 unreleased.

## Documentation and specification impact

Update `product/specs/remote-server.md`: the paragraph describing version 47 as one unreleased version is corrected to note that version 48 has since taken the next bump. No user-visible behavior changes, so no `help/` file or user-documentation file needs an update.
