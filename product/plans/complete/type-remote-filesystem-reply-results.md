# Type remote filesystem reply results by operation

**Complexity: 3/10** — ~20 added lines in 4 production files, 4 behavioral requirements and 6 test scenarios (p=4.812); a localized typing and guard change derived from the existing decoder map.

## Goal

Make the `filesystem-reply` wire frame carry the union of every operation's declared result shape instead of `unknown`, so the frame grammar and the per-operation validation table are one contract. Refuse a reply whose result matches no declared shape at the frame boundary, before it reaches a port caller.

## Approach

Derive a union of all decoder return types directly from the existing `resultDecoders` map, use it as the frame's `result` field type, and add a guard built from the same map. The descriptor table is not the source for this union because one operation's `run` signature erases its decoder result to `unknown`, which would collapse the union. `decodeReply` runs the guard before emitting a frame. The far side still validates each result against its own operation's decoder, so the frame-level guard is a coarse "matches at least one declared shape" check; nothing about results, refusals, or the wire format changes.

## Implementation steps

1. In `src/remote/filesystem/operations.ts`, export a union type over every decoder's return type (`ReturnType` of the `resultDecoders` values) and a guard that derives a type predicate from `Object.values(resultDecoders)`, trying each decoder and accepting when any succeeds.
2. In `src/remote/protocol-frames.ts`, type `filesystem-reply`'s `result` as that union instead of `unknown`. Import the type from the operation module as a type-only import so the wire module keeps no runtime dependency on it.
3. In `src/remote/frame/decode-filesystem.ts`, have `decodeReply` reject with the frame's malformed error when a non-error reply's `result` fails the new guard, and return the now-typed result otherwise. Leave the error-reply branch unchanged.
4. In `src/remote/serve-file-navigator.ts`, keep the descriptor table's deliberately erased `unknown` result at the producer but assert the declared union at the single emit site. Test files are excluded from the TypeScript project, so reply-synthesizing test helpers need no change.
5. Update `product/specs/remote-server.md` to note that a reply carrying a result matching no declared shape is refused as a malformed frame.

## Tests

- In `src/remote/filesystem/operations.test.ts`, assert the new guard accepts a representative valid result for every operation and rejects a value that matches no declared shape.
- In `src/remote/protocol.test.ts`, replace the `as { result: { content: string } }` cast with the typed field, fix the stale `{ entries: [] }` reply fixture to a declared shape, and add a case where a reply's result matches no declared shape and is refused as malformed.
- Run `$janissary/scripts/run.mjs check-diff` after each implementation and test step.

## Out of scope

- Changing operation results, arguments, path containment, or refusal wording.
- Changing the wire format, protocol version, or adding per-operation discriminants to the reply frame.
- Updating user documentation; no user-visible behavior changes.
