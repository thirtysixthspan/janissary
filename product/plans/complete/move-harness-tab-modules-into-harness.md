# Move the harness-named modules out of `web/src/shared/` into `web/src/harness/`

## Complexity

4/10 — four file moves, two consumer import retargets, per-file depth retargets inside the moved files, and three comment corrections. No logic changes and no new architecture.

## Goal

`web/src/shared/HarnessTabMeta.tsx` and `web/src/shared/harness-tab-intents.ts` are each imported only by `web/src/harness/HarnessTab.tsx`, so shared code carrying the harness feature's own knowledge sits in the shared layer, in violation of §2 of the React organization guidelines (colocate by default; promote to shared on the second real consumer; once shared, a module may not know any particular feature). Move both, with their colocated tests, into `web/src/harness/` so the shared layer stops holding code only one feature can want, and the next tab kind to render a metadata row colocates its own rather than importing this one.

## Approach

`git mv` the four files into `web/src/harness/`, keeping file names and exports. Inside the moved `HarnessTabMeta.tsx`, retarget every shared specifier for the new depth; inside the moved `harness-tab-intents.ts`, `../ws` is unchanged because the destination sits at the same depth as `web/src/shared/`. Retarget the single consumer, `web/src/harness/HarnessTab.tsx`, to import the two siblings unqualified. Correct the three comments that the move makes stale: the two in `web/src/shared/` that name `HarnessTabMeta` as the placement story (both files stay shared because `web/src/plugins/usePluginRemote.ts` and `web/src/harness/HarnessTab.tsx` both import them), and the one inside the moved `harness-tab-intents.ts` that calls itself a shared module. `web/src/harness/HarnessTab.test.tsx` names `HarnessTabMeta` only in a comment and needs no edit. The existing `import-x/no-restricted-paths` zones already cover the destination directory: a feature importing shared is allowed, and nothing outside `web/src/harness/` imports the moved modules.

## Implementation

1. `git mv web/src/shared/HarnessTabMeta.tsx web/src/harness/HarnessTabMeta.tsx`, `git mv web/src/shared/HarnessTabMeta.test.tsx web/src/harness/HarnessTabMeta.test.tsx`, `git mv web/src/shared/harness-tab-intents.ts web/src/harness/harness-tab-intents.ts`, and `git mv web/src/shared/harness-tab-intents.test.ts web/src/harness/harness-tab-intents.test.ts`.
2. In the moved `web/src/harness/HarnessTabMeta.tsx`, retarget every shared specifier for the new depth — `web/src/shared/` and `web/src/harness/` are siblings, so each `./X` becomes `../shared/X`: `./tab/flag-display`, `./icons`, `./status-windows/StatusWindowButton`, `./SplitTabButton`, `./RecordingFlag`, `./status-windows/status-button`, `./RemoteChip`, `./ConnectionPlug`, and `./RemoteSessionButton` become `../shared/tab/flag-display`, `../shared/icons`, `../shared/status-windows/StatusWindowButton`, `../shared/SplitTabButton`, `../shared/RecordingFlag`, `../shared/status-windows/status-button`, `../shared/RemoteChip`, `../shared/ConnectionPlug`, and `../shared/RemoteSessionButton`. The `@shared/protocol` alias is depth-independent and stays.
3. In the moved `web/src/harness/harness-tab-intents.ts`, `../ws` stays as it is — the two directories sit at the same depth — and its header comment's "this shared module" is corrected to describe a colocated module.
4. In the moved `web/src/harness/harness-tab-intents.test.ts`, `../ws` likewise stays as it is. `HarnessTabMeta.test.tsx` imports only `./HarnessTabMeta` and needs no edit.
5. In `web/src/harness/HarnessTab.tsx`, change `../shared/HarnessTabMeta` to `./HarnessTabMeta` and `../shared/harness-tab-intents` to `./harness-tab-intents`.
6. Correct the stale wording naming `HarnessTabMeta` in `web/src/shared/remote-session-control.ts` and `web/src/shared/RemoteSessionButton.tsx`, which stay in shared.
7. Run `./scripts/run.mjs check-diff` after the moves and again after the retargets.

## Tests

No new tests. The behavior this move must preserve is pinned by the two suites that travel with the sources — `web/src/harness/HarnessTabMeta.test.tsx` (the row's flags, recording control, connections and schedule buttons, and remote detach control) and `web/src/harness/harness-tab-intents.test.ts` (the metadata-action RPCs) — plus `web/src/harness/HarnessTab.test.tsx`, which covers the consumer and needs no edit. All must pass from their new locations with no changes beyond the import paths above.

## Out of scope

- Moving `web/src/shared/remote-session-control.ts` or `web/src/shared/RemoteSessionButton.tsx` into the feature directory; both have a second consumer (`web/src/plugins/usePluginRemote.ts`) and stay shared, with only their comments corrected.
- Renaming either moved file, or changing either export's signature.
- The unrelated comment references to `HarnessTabMeta` in `web/src/plugins/shell/ShellTabMeta.tsx`, `web/src/plugins/api.ts`, and `web/src/theme.test.ts` — none names a path and none becomes false.
- Any change to the metadata row's rendering, props, or keyboard behavior.

## Verification

- `./scripts/run.mjs check-diff` passes after each step.
- A repository-wide search for `shared/HarnessTabMeta` and `shared/harness-tab-intents` finds no remaining import.
- `web/src/shared/` no longer contains a file named for the harness feature.

## Documentation and specification impact

None. This is a behavior-preserving source-layout refactor; nothing a user can observe changes, so no spec, `help.md`, or user documentation update is needed.
