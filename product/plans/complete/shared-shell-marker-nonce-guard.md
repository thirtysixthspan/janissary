# Shared shell marker nonce guard

**Complexity: 4/10** — ~22 added lines across 6 production files, 4 behavioral requirements, 5 test scenarios (p=4.9092); a localized extraction through existing guard modules, no new architecture.

## Goal

Give the 32-lowercase-hex shell marker nonce format one definition that the server's zsh startup script, the client-imported shell plugin contract, and both remote frame decoders all use, so a format change is a single edit and the `session-state-result` path validates the same shape `spawn` does.

## Approach

Add the guard to `src/value-guards.ts`, the existing host-neutral guard module (its only import is a type import, so it is safe in the browser graph). Core modules import it there directly. The shell plugin's `shared.ts` reaches it through the published plugin contract `src/plugins/api.ts`, the only host module a server tab plugin may import and one that already republishes guards from `src/value-guards.ts`; this keeps the plugin boundary rule satisfied. Keep the two published guard names (`isZshHookNonce`, `isShellMarkerNonce`) as thin aliases so every existing caller and the plugin's guard suite keep their import path. Replace the inline regex in the session-state decoder with a call to the guard and pin the invalid-nonce case that decoder lacked.

## Implementation steps

1. Add `isShellMarkerNonce` to `src/value-guards.ts` and republish it from `src/plugins/api.ts` beside the existing value-guard publications. Run `./scripts/run.mjs check-diff`.
2. In `src/shell/zsh-startup/script.ts`, import the guard from `../../value-guards.js`, keep `isZshHookNonce` as a thin alias, and correct the comment that explains the old duplicated copy. Run `./scripts/run.mjs check-diff`.
3. In `src/plugins/shell/shared.ts`, import the guard from `../api.js`, keep `isShellMarkerNonce` as a thin alias, and correct the header comment that claims the module must import nothing. Run `./scripts/run.mjs check-diff`.
4. In `src/remote/frame/decode-lifecycle.ts` and `src/remote/frame/decode-sessions.ts`, import the guard from `../../value-guards.js` and use it for `shell.nonce`, replacing the inline regex in the latter. Run `./scripts/run.mjs check-diff`.
5. Add the invalid-nonce session-state test case, then the spec/help/doc checks and shipping steps. Run `./scripts/run.mjs check-diff`.

## Tests

In `src/remote/protocol.test.ts`, add a `session-state-result` refusal case whose process carries `shell: { nonce: 'bad' }`, asserting the whole frame is rejected as malformed. Keep the existing valid-nonce round-trip, the spawn invalid-nonce case, and the `src/plugins/shell/shared.test.ts` accept/reject suite passing unchanged — they are the behavior contract for the shared guard.

## Out of scope

Changing what any guard accepts or rejects, the nonce minting in `createShellMarkerNonce`, other nonce-format copies outside the four named sites, the frozen v1 fixture, spec or help or public-documentation additions (the format and behavior are unchanged), and merging.
