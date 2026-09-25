# Restore the remote session-state decoder's dropped `autoApprove` and pin every frame's optional fields

**Complexity: 3/10** — one decoder gains a field it already should have carried, one test adds a fixture table the compiler keeps complete, and a handful of copied helpers move into one module. No wire-format change, no new behavior beyond the field surviving the decode, and the existing refusal tests pin every error text the helper move could disturb.

`decodeProcessState` in `src/remote/frame-decode-sessions.ts` destructures `{ id, program, mode, harness, agentName }` and never reads `autoApprove`, although `RemoteProcessState` declares it and `RemoteProcesses.states()` sends it. Attach does not notice today only because it reads `autoApprove` from the local session record. Nothing in `src/remote/protocol.test.ts` would catch the drop: the `session-state-result` fixture never sets the field. Separately, the `DecodeResult` type and `malformed` helper are copied into six decode modules, `optionalNonEmptyString` into two, and `nonEmptyString` is defined once in `frame-decode.ts` and imported by the other decoders from the unrelated `filesystem-argument-checks.ts`.

## Goal

A `session-state-result` answer keeps each process's `autoApprove` flag, validated the way `spawn` validates its own (absent, or a boolean — anything else makes the whole answer malformed). One compiler-complete fixture table round-trips a frame of every type with every optional field populated. The decode modules share one `DecodeResult`, one `malformed`, one `nonEmptyString`, and one `optionalNonEmptyString`. No refusal text changes and `REMOTE_PROTOCOL_VERSION` stays 20.

## Approach

1. **`src/remote/frame-decode-shared.ts`** (new): export `DecodeResult`, `malformed(type)` (the named form — the two unnamed copies in the sessions and history modules become `malformed('session-state-result')` and `malformed('shell-history')`, producing identical text), `nonEmptyString`, and `optionalNonEmptyString`.
2. **Decode modules**: `frame-decode.ts`, `frame-decode-acp.ts`, `frame-decode-detect.ts`, `frame-decode-filesystem.ts`, `frame-decode-history.ts`, and `frame-decode-sessions.ts` drop their local copies and import from the shared module. `positiveInteger`, `decodeEnv`, and `validCapturedAt` stay where they are — each has one user.
3. **`nonEmptyString`'s home**: it moves out of `src/remote/filesystem-argument-checks.ts` into the shared module rather than being kept in both. `filesystem-argument-checks.ts` has no internal use of it; its one other importer, `src/remote/filesystem-operations.ts`, imports it from the shared module directly (no re-export, per the barrel-file guideline).
4. **`decodeProcessState`**: destructure `autoApprove`, refuse it unless `undefined` or boolean, and spread it back in when present.
5. **`src/remote/protocol.test.ts`**: add a `{ [K in RemoteFrame['type']]: Extract<RemoteFrame, { type: K }> }` fixture record — mapped over the union so each key must hold a frame of its own type, and a new frame type fails the typecheck until it has a fixture — with every optional field populated, and one `it.each` over its values asserting each survives `roundTrip`. Where a frame's optional fields are mutually exclusive (`filesystem-reply`'s `result`/`error`), the fixture carries one and the existing cases continue to cover the other.

## Implementation steps

1. Create `src/remote/frame-decode-shared.ts`; switch the six decode modules and `filesystem-operations.ts` to it; remove `nonEmptyString` from `filesystem-argument-checks.ts`. Run `check-diff`.
2. Add `autoApprove` to `decodeProcessState`. Run `check-diff`.
3. Add the fixture table, its round-trip case, and a refusal case for a non-boolean `autoApprove` in a `session-state-result` process. Run `check-diff`.

## Tests

- `src/remote/protocol.test.ts`: a new `it.each` round-tripping one fully-populated fixture per frame type (the `session-state-result` fixture carries `autoApprove: true`, which fails before step 2).
- `src/remote/protocol.test.ts`: a new refusal case — a `session-state-result` process whose `autoApprove` is a string is refused by name.
- Every existing refusal case in `src/remote/protocol.test.ts` passes unchanged, pinning that the helper move altered no error text.

## Spec

`product/specs/remote-server.md` already says the remote process state carries each harness's auto-approve setting; its frame-validation paragraph gains the rule that the setting is absent or a boolean and is kept rather than dropped.

## Out of scope

- Making attach trust the peer's `autoApprove` instead of the local session record (`src/sessions/attach.ts`). This change only stops the decoder from losing the field.
- A mechanism forcing a fixture edit when a new optional field is added to an existing frame type.
- Any wire-format change or protocol version bump.
