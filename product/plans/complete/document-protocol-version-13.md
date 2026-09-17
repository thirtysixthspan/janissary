# Document remote protocol version 13 in the spec's version history

**Complexity: 1/10** — a spec-only addition, no code changes.

PR 1131 backlog item: *"Document the move to remote protocol version 13 in the spec section that narrates every previous version bump."*

`product/specs/remote-server.md` narrates every `REMOTE_PROTOCOL_VERSION` bump in order, ending with the end-to-end browser paragraph (version 9-or-so through the numbering the file already uses) and stopping there. This branch moves the constant to 13 — adding an optional session id to the handshake and the `reattach`/`reattach-result` frames for reattachment — without adding the matching paragraph, so the file's own narrative falls a version behind the code.

## Change

Add one paragraph to `product/specs/remote-server.md`, immediately after the end-to-end browser paragraph and before the "After the handshake, every frame is validated before dispatch" sentence, matching the shape every sibling paragraph already uses: what changed, and what a stale peer would do wrong. State that reattachment moves the version to 13; the handshake line now carries an optional session id and the frame union gains `reattach` and `reattach-result`; and a version-12 peer neither publishes a session id nor answers a reattach, so a local side would send it a frame it refuses as unknown — which is why the mismatch is refused at the handshake instead, as with every other version bump.

## Out of scope

Any code change. `src/remote/protocol.test.ts` already covers the version-13 round trip and the mismatch refusal.

## Verification

Read-through only; no `check-diff` needed for a markdown-only change, though it is run anyway per the standard workflow.

## Adaptation note (conflict resolution)

Rebasing this branch onto `master` surfaced that `master` had independently bumped `REMOTE_PROTOCOL_VERSION` to 13 for the `git-commit` filesystem operation (`commit-file-to-origin.md`) while this branch was in flight, so the two version-13 bumps collided. The reattach bump in `src/remote/protocol.ts` was renumbered to 14 to land after `master`'s, and `product/specs/remote-server.md`'s version-history paragraph now reads "Reattachment moves it to 14" against a version-13 peer, rather than the 13/12 numbers this plan and its title name. The plan's goal — narrating the reattach bump in that spec section — is unaffected; only the version number changed.
