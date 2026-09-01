# Derive the remote wire protocol's frame-type lists and decoder switch from the frame union

Complexity: 4/10

## Goal

Tie the remote frame contract to the code that admits it, so a frame type added to `ClientFrame` or `ServerFrame` fails the build rather than being encoded, shipped, and silently refused as unknown by the receiving end.

## Approach

Two links, both already established idioms in this repo:

1. **Admission.** Replace the two hand-written `Set<string>` literals in `src/remote/protocol.ts` with objects typed `Record<ClientFrame['type'], true>` and `Record<ServerFrame['type'], true>`, copying the idiom `CAPABILITIES` in `src/plugins/api.ts` uses and explains — a name added to the union without an entry here is a compile error. Membership is answered with `Object.hasOwn`, exactly as `isTabPluginCapability` does, rather than by materializing a `Set`: the two sets exist for nothing but that one check, so the `Set` wrapper is a step with no reader.

2. **Decoding.** Narrow `decodeKnownFrame` in `src/remote/frame-decode.ts` to take `type: RemoteFrame['type']` instead of `string` — `decodeFrame` has already checked membership before calling it — and replace its `default` arm's `{ error }` return with a call to a `never`-parameter helper modelled on `unhandledClientMethod` in `src/client-message.ts`. A frame type this build knows but forgot to decode then fails the build, with the throw as a runtime backstop.

For the narrowing to reach `decodeKnownFrame`, the membership check becomes a type predicate (`type is RemoteFrame['type']`) rather than a bare boolean.

The helper lives in `frame-decode.ts` beside its only caller rather than in `protocol.ts` beside the union: `protocol.ts` already imports `decodeKnownFrame` as a value, so putting a value export the other way would turn a type-only edge into a genuine runtime import cycle.

`decodeFrame`'s own unknown-type `{ error }` path is left exactly as it is. That answers a genuinely foreign frame from a mismatched remote, which is a different case from a frame this build declares but never taught itself to decode.

## Implementation steps

1. In `src/remote/protocol.ts`, replace `CLIENT_TYPES` / `SERVER_TYPES` with the two `Record<…, true>` objects and add the `isRemoteFrameType` type predicate over them.
2. Point `decodeFrame`'s membership check at the predicate, leaving its error message and return shape unchanged.
3. In `src/remote/frame-decode.ts`, add the `never`-parameter helper with a comment explaining what the parameter buys, and narrow `decodeKnownFrame`'s `type` parameter to `RemoteFrame['type']`.
4. Replace that switch's `default` arm with the helper call.
5. If either file crosses the 200-line limit, extract the frame-type records into their own module rather than compacting.

## Tests

- `src/remote/protocol.test.ts` pins the encode/decode round trip and the unknown-type rejection; it must keep passing unchanged, since `decodeFrame`'s foreign-frame path is untouched.
- `src/remote/channel.test.ts` pins how a decode error reaches the channel; unchanged.
- Add cases to `src/remote/protocol.test.ts` asserting that the derived type lists hold exactly the union's members — every declared client and server frame type is admitted, and the two lists do not overlap — so a record entry deleted alongside its union member (the one edit the compiler cannot catch) fails here.
- Run `./scripts/run.mjs check-diff` after each step.

## Specs and documentation

No user-visible behavior changes: the same frames are admitted, decoded, and rejected. No spec, `help.md`, or `documentation/user-documentation/` updates expected.

## Out of scope

- Per-frame field validation. Each frame's fields stay hand-checked in its own decoder, so a field added to an existing frame is still dropped silently — that is a separate entry's problem.
- Bumping `REMOTE_PROTOCOL_VERSION`; no frame type is added or removed here.
- Changing `decodeFrame`'s handling of a genuinely unknown frame type.
