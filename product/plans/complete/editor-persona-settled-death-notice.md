# Restore the editor persona one-time death notice after a settled reply

**Complexity: 3/10** — ~10 added lines in one production file, 5 behavioral requirements, 7 test scenarios (p=4.42)

## Goal

When an editor persona's shared role session dies between requests — after the previous request already produced a successful reply — the user still gets the single `<persona>: <message>` notification the behavior promises, and the dead slot is still forgotten so the next request opens a fresh, re-primed session. A late error from a closed or replaced session must remain silent, and a death during a request that already failed must not produce a second notice.

## Approach

`PersonaRoleSessionManager.died` in `src/acp/persona-role-session.ts` is the connection-level handler installed on every shared role session. It verifies `state.session === session`, captures `state.hooks`, calls `forgetPersonaRole` (deleting the runtime slot), emits `state` dirty, then invokes the captured hooks.

`EditorAcpManager.session` in `src/editor/acp-manager.ts` wraps those core hooks with its own hook whose `onError` calls `EditorAcpManager.died` and then `previous?.onError`. The wrapper is where the editor request's hook (`connectionLost` in `src/editor-suggest/handler.ts`) is reached: `EditorAcpManager.session` stores it in `this.hooks`, and `EditorAcpManager.died` is the only caller of that stored hook.

The regression is an ordering mismatch after the role-session refactor: by the time the wrapper runs, `PersonaRoleSessionManager.died` has already deleted the runtime slot, so `EditorAcpManager.died` reads `existingPersonaRoleRuntime` as undefined and returns early before reaching the stored `connectionLost` hook. The wrapper then calls only `previous?.onError`, the core hooks from `promptPersonaRole`, whose `attempt.prompt` is gone after a settled reply — a no-op. The death is reported nowhere.

The fix keeps the core ordering intact (so model fallback and the captured-`attempt` `settleAcpPrompt` keep working) and gives the editor owner its own session binding to consult:

1. `EditorAcpManager` records the `AcpSession` it bound under the `${label}:${role}` key when `session()` installs the wrapper.
2. `EditorAcpManager.died` checks that stored session against the one carrying the error instead of reading the runtime slot, then reaches the stored request hook even though the core owner has already forgotten the slot. It clears its own maps, calls the hook once, and leaves the `state` dirty emission to `PersonaRoleSessionManager.died`, which already emits it on every death path.
3. The `state.session !== session` guard stays in `PersonaRoleSessionManager.died`, so an error from a replaced or closed session is still dropped before any hook runs. `EditorAcpManager`'s own session check mirrors it for the editor-owned binding, and clearing the binding on death prevents a repeated error from the same session producing a second notice.
4. `connectionLost` in `src/editor-suggest/handler.ts` is unchanged: after a successful settle it posts exactly one notification; after a failed settle it stays quiet.

### Rejected alternatives

- Moving `hooks?.onError` ahead of `forgetPersonaRole` in `PersonaRoleSessionManager.died`. That reorders the core owner for every role caller (monitor and manual prompts too) and risks a replaced session emitting a second notice through the fallback retry path.
- Dropping the `previous?.onError` call from the editor wrapper or comparing hook identities. The core hook settles a pending prompt and drives model fallback, and identity comparisons would mask genuine duplicates.

## Implementation steps

1. In `src/editor/acp-manager.ts`, add a slot-keyed session binding map; populate it in `session()` alongside the hook map, clear it in `forget()` and `dispose()`, and stop importing `existingPersonaRoleRuntime`.
2. Rewrite `EditorAcpManager.died` to validate against the stored session, drop the redundant `state` dirty emission, and invoke the stored hook once.
3. Adjust the existing `acp-manager.test.ts` death-hook test to pass distinct core and editor hooks, reflecting the real wiring where the core hook settles the prompt and the editor hook reports the loss.
4. Add the integration test described below and run `$janissary/scripts/run.mjs check-diff`.

## Tests

- New `src/editor-suggest/death-notice.test.ts`: an integration test with a real `PersonaRoleSessionManager` and `EditorAcpManager` and a real `promptPersonaRole` pipeline (only `connectAcp`, `runCorePrompt`, role settings, and persona lookup are stubbed). It drives `editorSuggest` to a successful settled reply, fires the real connection handler, and asserts exactly one `editor-suggest` death notification naming the persona and message and no second callback; a repeated late error asserts no second notification and no second callback.
- `src/editor/acp-manager.test.ts`: the existing death-path tests keep passing — slot forgotten without `kill`, one dirty emission, freshest editor hook reached, replaced session's late error ignored.
- `src/editor-suggest/handler.test.ts`: the existing mocked-hook tests, including the post-success death notice and no-duplicate-after-failure cases, keep passing unchanged.

## Spec updates

None. `product/specs/editor-tab.md` already states that a loss between requests after a successful reply posts the notification once; the fix restores that documented behavior.

## Documentation

None needed. `documentation/user-documentation/tab-types/editor-persona-query.md` describes connection reuse but not the death-notice behavior, so there is nothing to correct.

## Out of scope

- `PersonaRoleSessionManager.died` ordering and the core prompt/fallback pipeline.
- The monitor and manual prompt paths, which use the core hooks directly.
- Changes to `connectionLost` or to the notification text/shape.
