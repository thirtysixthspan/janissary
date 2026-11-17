# Renumber the apply-patch protocol bump to 45

**Complexity: 1/10** — one production line changes in `src/remote/protocol.ts` with a three-line version comment, two requirements (leave `web-search` at 44, move `apply-patch` to 45), one existing test scenario (the version pin and handshake pairing) and no new units (p=3.21).

## Goal

The branch's `apply-patch` change claims remote protocol version 44, which master's `web search` change already claimed for the Tavily and TinyFish token names and the `web-search` operation. The handshake compares versions for exact equality, so a build carrying both features under 44 would admit a peer that has only one of the two operations: the missing operation would surface as an unknown-operation failure after connecting instead of being refused at the handshake the version check exists to enforce. The plan's Remote tabs decision, the new `apply-patch` paragraph in `product/specs/remote-server.md`, `REMOTE_PROTOCOL_VERSION`, and its pinned test must all name one operation set again.

## Approach

Keep master's version-44 comment and spec paragraph for the token names and `web-search`, and move this branch's bump to 45. The renumber is a single constant plus its version comment; the spec paragraph, the pinned test, and the completed plan's own record follow it. No wire shape changes: `apply-patch` already exists as an operation, its argument, and its result decoder, so only the version number that names the operation set moves.

## Implementation steps

1. In `src/remote/protocol.ts`, set `REMOTE_PROTOCOL_VERSION` to 45 and add the version comment after the version-44 paragraph: version 45 adds the `apply-patch` mutation carrying a whole patch to the far side, and a version-44 peer would refuse it as unknown after the handshake, so the exact-version handshake refuses that pairing first.
2. In `src/remote/protocol.test.ts`, pin the version test at 45. Leave the handshake tests alone; the older-version matrix derives its length from `REMOTE_PROTOCOL_VERSION`, so it covers 45-versus-every-older pairing without edits.
3. In `product/specs/remote-server.md`, keep master's version-44 paragraph and rewrite this branch's paragraph to start "Protocol version 45 adds `apply-patch` …" and end "A version-44 peer would refuse the unknown operation only after connecting, so the handshake refuses it first."
4. In `product/plans/complete/file-patch.md`, make the Remote tabs design decision and the `src/remote/protocol.test.ts` test entry record 44 → 45, matching master's completed web-search plan's record of 43 to 44.
5. Keep both `web-search` and `apply-patch` in `src/remote/filesystem/operations.ts`, `src/remote/protocol-frames.ts`, `src/remote/filesystem/result-decoders.ts`, and `src/file-navigator/remote/port-requests.ts`, and keep both operations listed in `src/remote/filesystem/operations.test.ts` and `src/file-navigator/remote/port-requests.test.ts`.

## Tests

No new tests. The version pin in `src/remote/protocol.test.ts` moves from 44 to 45, and the existing `handshake` suite already covers the pairing: it announces this build's version, rejects a mismatched version naming both numbers, and rejects every older version from 1 through `REMOTE_PROTOCOL_VERSION - 1`. `src/remote/filesystem/operations.test.ts` and `src/file-navigator/remote/port-requests.test.ts` keep their `web-search` and `apply-patch` entries side by side. Verify with `$janissary/scripts/run.mjs check-diff`.

## Spec and documentation

`product/specs/remote-server.md` carries the protocol paragraph for version 45 and keeps the version-44 paragraph intact. No `help/` page or user documentation describes protocol versions, so none changes.

## Out of scope

- Changing what `apply-patch` carries, validates, or returns.
- Renumbering `web-search`, the token names, or any earlier protocol version.
- Touching `product/plans/ready/subagent.md`'s future 43 → 44 note, which describes a plan master has not implemented.
