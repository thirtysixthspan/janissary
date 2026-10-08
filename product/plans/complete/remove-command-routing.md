# Remove command routing

**Complexity: 6/10** — remove recognition and a server-driven modal across dispatch, messaging, the shared wire contract, and the overlay system, preserving explicit command execution.

## Goal

Remove all probabilistic shell, SQL, and ACP recognition and the route chooser. Unclaimed agent-tab commands and messages receive the existing unknown-command response. Explicit application commands, `shell`, `!`, `!!`, `db sqlite query`, and supported explicit ACP remain. Shell tabs retain their existing fallback to zsh.

## Approach

The user selected full removal rather than keeping confident routing. Preserve the command registry, contextual resolver, ACP availability guard, database connection attribution, interactive-program detection, remaining picker registry, and shared command-bar disabled property used by shell tabs. Routing has no published plugin recognizer contract or persisted chooser/configuration state; old history and scheduled command strings remain readable and use the remaining dispatcher. No migration, warning, shim, or cleanup of user data is added.

Keep and rewrite shell and database documentation. Delete routing-only backlog entries and the two mixed database documentation entries dated 2026-09-26 and 2026-09-27, as requested. Delete `product/plans/draft/multiagent.md` and `product/plans/deferred/force-interactive-terminal-with-an-i-prefix.md`, as requested, rather than updating their references. Completed plans and changelogs remain historical records.

## Implementation steps

1. Remove server recognition and client chooser together. Delete `src/recognizers/`, `src/route-choice.ts`, `src/command/router.ts`, and their dedicated tests. Detach `src/command/manager.ts`, `src/capture/manager.ts`, `src/capture/router.ts`, `src/controller.ts`, and `src/managers.ts`. Typed unknown input appends the resolver's existing reply; captured unknown input returns the existing reply. Retain help capture and empty-message behavior. Remove chooser fields from `src/protocol.ts`, `src/protocol/{tab,events,core-rpc}.ts`, `src/state-event.ts`, `src/client-message.ts`, `src/client-params/core.ts`, and `src/message/{handler,tabs}.ts`.
2. Within that same contract change, delete `web/src/pickers/{RouteChooser.tsx,RouteChooser.test.tsx,useRouteChooser.ts,useRouteChooser.test.ts}`. Detach `web/src/{App.tsx,AppMain.tsx,useServerState.ts,ws.ts,useWindowKeys.ts,keyboard-handlers.ts,useCmdW.ts,useCmdWRefs.ts}`, `web/src/pickers/{usePickerOverlays.ts,PickerOverlays.tsx,overlay-registry.ts}`, `web/src/pickers/picker/{overlay-view.ts,key-bindings.ts,overlays-state.ts,state-test-fixture.ts}`, and `web/src/agent-tabs/{AgentTabBody.tsx,command-input/CommandInput.tsx,command-input/CommandArea.tsx}`. Remove chooser-only disabling and focus restoration while retaining shared shell-bar disabling. Update `src/resolve.ts` comments to describe the remaining behavior.
3. Delete chooser/recognition assertions and cases in `src/{controller.test.ts,route-choice.test.ts}`, `src/command/manager.test.ts`, `src/capture/router.test.ts`, `src/message/handler.test.ts`, and `src/client-params/core.test.ts`. Remove routing fields from shared fixtures and related assertions in `web/src/{App.test.tsx,App.initial-state.test.tsx,App.launch-focus.test.tsx,useServerState.test.ts,useWindowKeys.test.ts,keyboard-handlers.test.ts,useCmdW.test.tsx,useCmdWRefs.test.ts,ws.test.ts,useAppCommandBarState.test.ts,MountedViewLayers.test.tsx}`, `web/src/pickers/{usePickerOverlays.test.tsx,PickerOverlays.test.tsx,overlay-registry.test.ts}`, and `web/src/pickers/picker/{overlay-view.test.ts,key-bindings.test.ts}`. Preserve assertions for remaining features; adjust only removed-interface fixture plumbing. Add `src/command/routing-removal.test.ts` to exercise unknown typed, targeted, and captured shell/SQL/prose input, explicit commands, and retained shell plugin fallback.
4. Delete `product/specs/command-routing.md` and the two user-selected plans. Update `product/specs/{acp,messaging,websocket-rpc,keyboard-navigation}.md`, `documentation/user-documentation/command-bar/{shell,database}.md`, `documentation/user-documentation/getting-started/keyboard.md`, `documentation/developer-documentation/overlay-plugins.md`, and `ai/guidelines/{architecture-principles,plugins}.md` to remove routing references and document explicit input. Update shell examples that would otherwise depend on recognition. Remove the four routing-only and two mixed database entries from `product/backlog/documentation.md`. No page/navigation/screenshot asset other than the feature spec is exclusively owned by routing.
5. Remove only new dead-code findings caused by this removal after searching each for dynamic/external uses; leave baseline findings alone. Run diff-scoped checks after each coherent step, then full checks and possible live verification. Promote this plan and open a breaking-change PR for human merge.

## Tests

Retain remaining-feature expectations. Delete recognition and chooser cases, plus removed fields in test fixtures; do not replace expectations to conceal breakage. Add focused removal coverage for agent commands, messages, scheduling's targeted dispatcher, and explicit input. Existing shell-tab, ACP, database, picker, keyboard, and lifecycle tests must remain green.

The user approved adding two files discovered during verification: update the obsolete nine-overlay count comment in `web/src/shared/contributed-overlays.ts` and delete the documentation count assertion and its case in `web/src/overlay-plugins/registry.test.ts`. Keep all other overlay-plugin expectations. The initial full test run passed 12,283 tests and failed only this obsolete count assertion; it is resolved within this approved scope extension.

## Spec updates

Delete the feature-only routing spec. Keep precise unknown-command and explicit-command behavior in messaging/ACP specs and shell/database user docs. Remove chooser state and priority from wire/keyboard/overlay documentation. Shared parser and command-registry architecture remains documented.

## Verification

Fresh baseline: `npm run typecheck` passed; `npm run lint` passed with one existing cognitive-complexity warning in `web/src/shared/fuzzy-match.ts`; `npm test` passed, 867 files, 12,360 passed and one pre-existing skipped test.

Complete `npm run knip` baseline (exit 1):

```text
Unused exports (1)
RemoteChip  web/src/plugins/api.ts:65:10
Unused exported types (1)
TabPluginLaunchReady  type  src/plugins/api.ts:24:27
```

Fast check: `./scripts/run.mjs check-diff`. Final checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run knip`, `npm run docs:build`, and the PR workflow's hard-check gate. Never run `npm run check`.

Live checks, if the attached browser variables are available: agent unknown versus explicit shell input, explicit database query with one and multiple databases, message replies, targeted scheduled command dispatch, preserved shell-tab fallback, and the remaining picker/keyboard interactions including closing tabs. Verify supported ACP availability through existing tests; external model credentials may prevent a live model round trip. Start and stop only a scratch instance under `temp/remove-an-existing-feature/`; record every skipped check and reason here and in the PR.

Live verification is skipped for agent input, messaging, targeted scheduling, database queries, shell tabs, ACP, and picker/keyboard interactions: neither `JANISSARY_BROWSER_WS_ENDPOINT` nor `JANISSARY_PLAYWRIGHT` is set. No scratch app is started.

Final verification: diff-scoped lint, typecheck, server tests, and web tests passed. Full typecheck and lint passed with the same existing warning. The full suite passed all 861 remaining test files, with 12,283 tests passed and the same one pre-existing skipped test. `npm run docs:build` passed. The final dead-code scan reports exactly the two baseline findings; no new findings were created, and both pre-existing findings remain untouched. Reference searches found no remaining chooser or recognizer references in current source, specs, documentation, help, or backlog. The PR workflow runs its required hard-check gate before the commit.

## Out of scope

Unrelated dead code, completed plans, changelogs, plugin API redesign, command registry removal, changing the shell-tab dispatcher, and user-data migration or cleanup. No dependency update. No PR merge.
