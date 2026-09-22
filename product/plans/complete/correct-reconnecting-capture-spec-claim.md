# Correct the reconnecting capture claim in the harness spec

Complexity 2/10 - a spec-text correction with no code or behavior change, and no PR description
edit (the entry's own Proposal says to leave the pull request's title and body alone).

`product/specs/harness.md`'s screen-capture section opens by pairing attached and reconnecting
as the round-tripping case ("Attached or reconnecting, the request round-trips the live
connection"), then three sentences later states a reconnecting tab has no live connection and
fails immediately with `No capture available for "<name>" — connection is reconnecting.` —
contradicting itself. `resolveOpenRemoteCapture` in `src/harness/subcommands.ts` checks
`managers.remote.reconnectingOf(label)` first and returns the reconnecting error for every such
tab; there is no round-trip path for a reconnecting tab at all.

## Goal

The spec paragraph describes only the three cases `captureSubcommand`/`resolveOpenRemoteCapture`
actually implement: attached round-trips, reconnecting fails immediately, fully detached
resolves through the persisted record. No behavior changes; `src/harness/subcommands.test.ts`'s
"fails immediately for a reconnecting tab, without touching the channel" case, which already
pins this behavior, is untouched.

## Approach

In `product/specs/harness.md`, change "Attached or reconnecting, the request round-trips the
live connection." to "Attached, the request round-trips the live connection." — the rest of the
paragraph already correctly describes the reconnecting and fully-detached cases (including the
sentence this same PR's capture-request fix added, about a tab whose connection has not
completed its initial attach yet).

`product/specs/remote-server.md`'s "Detached-session auto-accept, notifications, and captures"
section says `harness capture <name>` "works against a detached or reconnecting session on
demand" — a softer claim than harness.md's had. It does not claim a round trip, and does not
contradict itself the way harness.md's paragraph did, so it is left as written; the entry's own
instruction is to fix it "if present," and this pairing is not the same misstatement.

## Implementation steps

1. Edit the one sentence in `product/specs/harness.md`.
2. Confirm `product/specs/remote-server.md` has no equivalent contradiction to fix.
3. Run `check-diff` (spec-only change; expected to have nothing scoped to lint or test).

## Tests

None — no code changed. `src/harness/subcommands.test.ts`'s existing "fails immediately for a
reconnecting tab, without touching the channel" case continues to pin the behavior the spec now
correctly describes.

## Out of scope

- The pull request's own title and body — explicitly left alone per the entry's Proposal.
- Any change to `resolveOpenRemoteCapture` or `captureSubcommand` — the behavior already matches
  the corrected spec text.
- `product/specs/remote-server.md`'s softer "works against a detached or reconnecting session"
  phrasing, which is not the round-trip claim being corrected.
