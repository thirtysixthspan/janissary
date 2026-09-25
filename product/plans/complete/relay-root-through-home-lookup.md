# Resolve an attach's and a parked-capture query's root through the home-directory lookup

**Complexity: 5/10** — an optional field on two client frames and their decoders, one extra argument through the relay root lookup, two local senders, and tests. No new mechanism: the classifier a launch already runs is reused, with its offer and refusal outcomes read as "no root".

## Goal

A session provisioned through the no-path or `~` home flow is rooted at `~/<repo-name>`. Its detached peer writes its record under `~/<repo-name>/.janissary/remote/`. But an attach and a parked-capture query resolve their root with no origin, so the no-path walk-up never reaches `~/<repo-name>` and a `~` address is refused as not a repository. Every reconnect, every attach from the sessions tab, and every detached `harness capture` of such a session then fails and ends the session.

The attach and the capture query should send the launching project's origin, and the far side should resolve their root with it, landing on the same `~/<repo-name>` the launch did.

## Design decisions

- **Both frames gain an optional `origin`**, decoded exactly as `provision.origin` is (absent, or a nonempty string). Protocol 21 has not shipped, so no version bump is needed.
- **The local side sends the same credential-free origin a launch sends.** `provisionOrigin` in `src/remote/entry-factory.ts` is exported and reused by the attach sender there and by the detached capture query in `src/harness/capture-remote.ts`. The live-channel capture in `src/harness/subcommands.ts` is left as it is: that server holds its own root and never looks one up.
- **`rootForRelay` takes the origin and accepts only a `root` outcome.** An offer or a refusal is treated as no root, so an attach never offers a clone and still answers `accepted: false` when the root is missing. A relay without an origin behaves as today.
- **The origin comparison now applies to an attach.** An explicit path whose repository has a different `origin` than the attaching project no longer relays. That is the right answer: the peer recorded there cannot belong to this project.

## Implementation steps

1. `src/remote/protocol.ts`: add `origin?: string` to the `attach` and `capture-request` members of `ClientFrame`, and extend the version-21 comment and the member comments to say so.
2. `src/remote/frame-decode.ts`: decode `attach.origin` with `decodeOrigin`, rejecting a present-but-invalid value as malformed and copying a valid one.
3. `src/remote/frame-decode-detect.ts`: decode `capture-request.origin` the same way.
4. `src/remote/serve-root-settle.ts`: `rootForRelay(pathArgument, origin, home)` classifies with the origin and returns only a `root` outcome's root.
5. `src/remote/serve.ts`: `lookupRoot(origin)` passes the frame's origin; the `attach` and `capture-request` arms hand it their frame's `origin`.
6. `src/remote/channel-capture.ts` and `src/remote/channel.ts`: `CaptureRequestTracker.request` and `RemoteChannel.requestCapture` take an optional origin and put it on the frame when present.
7. `src/remote/entry-factory.ts`: export `provisionOrigin` and spread it into the `attach` frame.
8. `src/harness/capture-remote.ts`: pass the origin to `requestCapture`.
9. `src/remote/serve-root.ts`: update `resolveRemoteRoot`'s doc comment, which says an attach carries no origin.

## Tests

- `src/remote/protocol.test.ts`: the fully populated `attach` and `capture-request` fixtures carry `origin`; an attach and a capture request with an empty or non-string origin are malformed.
- `src/remote/serve-root-settle.test.ts` (new): `rootForRelay` with an origin finds a clone at `<home>/<repo-name>` for `~`; returns undefined for a missing home target (an offer) and for an explicit path whose repository has a different origin (a refusal); without an origin keeps today's rules (`~` is not a repository; any origin at an explicit path is used).
- `src/remote/serve.test.ts`: an attach from a server addressed at `~` whose home holds a clone of the origin relays into a peer parked under that clone and is accepted; the same attach with no clone in the home answers `accepted: false` and offers nothing; a parked-capture query with an origin reaches a peer parked under the home clone.
- `src/remote/manager.test.ts`: an attach from a record sends the launching project's origin with its credential removed.
- `src/harness/capture-remote.test.ts`: the detached capture query sends the credential-free origin, and none for a project without one.
- The existing detached-peer rendezvous tests in `src/remote/serve.test.ts` keep passing.

## Spec

`product/specs/remote-server.md`: in "Missing clone", attaching still never offers; in "`janus remote-serve`", an attach and a detached capture query resolve their root with the launching project's `origin` the way a launch does, so a session rooted at `~/<repo-name>` is found again, and anything other than an existing clone of this project answers as a missing session.

## Out of scope

- Storing the origin in the local session record. The launching project's current origin is what the launch compared against, and a project whose origin changed since is a different project for this purpose.
- Any change to the live-channel capture path, which never looks up a root.
