# Scripts wire copy decision

**Complexity: 2/10.** Records one open decision and its trade-offs in plan prose and removes one backlog entry. No code, test, config, or spec changes.

## Goal

The repair commit `09b0c79f` closed the backlog entry that asked the scripts plugin to stop re-declaring the runscript wire types, and it recorded that entry as resolved. The scripts plugin still keeps its local copy of `RunscriptRow` and `ScriptsPayload` in `src/plugins/scripts/shared.ts`. The repair kept that copy by a specificity argument that names only one of the rules bearing on it. This plan records the copy as an open decision, names every rule that bears on it, names what now guards it at compile time, records that the schedules plugin has the same kind of copy, and records the corrections owed to two earlier plans. It does not resolve the conflict. Resolving it is for the owner to decide in `ai/guidelines/`.

## Verified state

Checked on the branch at `a803b7ae`, the head when this run started.

- `src/plugins/scripts/shared.ts` declares `RunscriptRow` (line 3) and `ScriptsPayload` (line 5), and has no import line.
- The wire views are `RunscriptRowView` and `RunscriptsView`, defined in `src/protocol/runscripts.ts` and re-exported by `src/protocol.ts` line 76. `src/plugins/api.ts` does not re-export them. It does re-export `AggregatedScheduleView` and `ConversationsView` from `../protocol.js` as types (lines 494-507), so a plugin's activation can name wire types through `api.ts`, while a shared contract can name nothing.
- The producer `src/schedule/system/runscript-rows.ts` is a non-test file under `src/`, so the root tsconfig compiles it. It imports `RunscriptRow` type-only from the scripts shared module (line 2), annotates the host rows as `RunscriptRow[]` (line 30), and returns them as `RunscriptsView` (line 38). That compiles in both directions.
- The runtime half of the repair is `accepts the rows the host builds` in `src/plugins/scripts/shared.test.ts` (lines 15-17), which runs the host builder's output through `isScriptsPayload`.
- The scripts notify handler in `src/plugins/scripts/activate.ts` (lines 40-45) returns without acting when the slice fails `isScriptsPayload`, so a row shape the guard rejects drops every delivery with no message. The command path (lines 36-37) reports a failure instead.
- No copy of the runscript types exists in `web/src/` on this branch.
- `product/backlog/technical-debt.md` on this branch has no entry for the schedules copy, and `git diff --stat origin/master...HEAD` shows the file unchanged on the branch. The master-only entries that `git diff origin/master` shows as absent from the branch do not concern the schedules copy.
- Core imports a plugin shared module at runtime: `src/harness/manager.ts` line 13 imports `SHELL_PROGRAM` from `../plugins/shell/shared.js`. The repair plan cites this precedent accurately.

## The rules in conflict

- R1, import-nothing: `ai/guidelines/plugins-tabs.md` line 10 says a plugin's `shared.ts` "imports nothing, not even a type". Its stated reason is that the client runs the guards through `@shared`, and an import could pull NodeNext resolution or server behavior into the browser graph.
- R2, one wire definition: `ai/guidelines/plugins-tabs.md` line 78 says `src/protocol.ts` is the only wire definition, and line 82 says shared guards stay hand-written and import-free.
- R3, pre-ship checklist: `ai/guidelines/plugins.md` line 157, in the "Before shipping a plugin" checklist, says to confirm no wire type is redeclared locally.
- R4, cross-boundary shapes: `ai/guidelines/plugins.md` line 105 says all cross-boundary shapes live in `src/protocol.ts` and are imported, not mirrored.
- R5, second definition: `ai/guidelines/plugins.md` line 149 names a second definition of a wire type as an anti-pattern. `ai/guidelines/architecture-principles.md` section 7 (line 59) states the one-definition wire rule, but its words are scoped to `web/src/`, so it bears on the server copy only through its principle.
- Tension inside R1's own file: `ai/guidelines/plugins-tabs.md` line 124 says type-only imports are fine on the client host side, because the compiler erases them before the bundler sees them. An erased type-only import does not reach the browser graph, which is R1's stated reason, yet R1 as written forbids it.
- The lint does not decide it. `eslint.plugin-boundaries.mjs` lines 27-38 refuse a server plugin's `../../protocol.js` import but allow `../api.js`, so a type-only `../api.js` import from `shared.ts` passes lint. Only the guideline text forbids it.
- Practice is not uniform. Thirteen files import runtime value guards from `../api.js` today: `src/plugins/{asciicast,audio,conversations,image,markdown,page,pdf,search,sessions,shell,sql,video}/shared.ts` and `src/plugins/sql/shared-intents.ts`. Only the scripts and schedules contracts import nothing. Master's `product/backlog/technical-debt.md`, which this branch does not yet contain, carries an entry titled "Have the thirteen plugin shared contracts take their guards from leaf modules..." that says R1 "has to be read literally today" and asks the owner to amend it.

## Decision

Keep the local copy in `src/plugins/scripts/shared.ts`. Do not import the host types into it, and do not re-export them through `src/plugins/api.ts` for it, because R1 read literally forbids the import. The choice follows R1 as written. R2 through R5 bear on the same copy and are not satisfied by it in their own words, so the decision is open. This fix does not settle it. The owner settles it in the guidelines. The options the owner has, none chosen here:

1. Amend R1 to allow type-only imports from `../api.js` in shared contracts, as `plugins-tabs.md` line 124 already allows on the host side. Then re-export `RunscriptRowView` and `RunscriptsView` from `api.ts` as types, beside the existing schedules re-exports, and make the scripts and schedules copies aliases of them. The boundary lint already admits `../api.js`.
2. Keep R1 literal and amend R2 through R5 to exempt a plugin shared contract's own wire views, recording the copy as the accepted cost.
3. Keep the status quo, with the compile pin below as the mitigation, until the owner picks option 1 or 2.

The owner should also decide the wording. R2 names `src/protocol.ts` as the only wire definition, but the definitions sit in per-domain modules under `src/protocol/` that the barrel re-exports. The rule should name the protocol module and its domain files together.

## Compile-time guard for the scripts copy

`src/schedule/system/runscript-rows.ts` carries the pin: the comment at lines 27-29 and the annotation and return at lines 30 and 38. The root tsconfig includes `src/**/*.ts` and excludes `src/**/*.test.*` (`tsconfig.json` lines 14-15), so `npm run typecheck:diff` compiles the pin. The annotation catches a host field the copy names being renamed, removed, or retyped. The return catches a copy field the host does not provide. The runtime guard is exercised by `accepts the rows the host builds`.

Limits. The pin covers only the producer that annotates it, so any other producer of the same payload needs its own annotation. It does not check the hand-written `typeof` body of `isRunscriptRow`, because TypeScript does not check a type predicate's body against its type; a change to the copy's fields reaches that body only through the runtime test, and only for the rows that test builds. It does not cover an optional host field, which the guard does not read.

## The schedules copy

`src/plugins/schedules/shared.ts` re-declares `ScheduleRow` (lines 3-14) under the same rules, and no decision has been recorded for it. Its compile coverage runs in one direction only. `src/plugins/schedules/activate.ts` `toPayload` (lines 27-36) assigns each host `AggregatedScheduleView` into a `ScheduleRow[]` in a compiled file, so a host change to a field the mapping reads fails the typecheck.

The reverse direction, copy to host, rests on `src/plugins/schedules/shared.test.ts` lines 13-19. That file is outside every typecheck gate: the root tsconfig excludes it, `web/tsconfig.json` includes only `src` and `vite.config.ts`, and vitest does not typecheck. Its runtime assertion `expect(asPluginRow).toEqual(ROW)` (line 23) compares `ROW` with itself, so it is vacuous. The comment at `src/plugins/schedules/shared.ts` lines 4-6 says the test pins the two shapes against each other, which overstates it: only the forward direction, through `toPayload`, is compiled.

Routing. The schedules copy should be recorded in `product/backlog/technical-debt.md` as a debt entry by the owner or a later run. The file it lives in is `src/plugins/schedules/shared.ts`, with its uncompiled pin in `src/plugins/schedules/shared.test.ts` and its forward check in `src/plugins/schedules/activate.ts`. This run did not record it, because its allowed edits exclude `technical-debt.md`, and the entry's Proposal to append it there is not carried out here.

## Corrections owed to earlier plans

These plans are not edited in this run. The corrections are recorded here for the owner.

1. `product/plans/complete/scripts-shape-pin-typecheck.md`, Design decisions, the paragraph beginning "The local copy stays" (line 21). It settles the copy by "the more specific rule wins" and names only R1 and R3. It does not weigh R2, R4, or R5. The sentence reads as a settlement, and it is not one. Its Out of scope section (line 47) calls the schedules pin uncompiled, does not mention the compiled forward check in `src/plugins/schedules/activate.ts`, and records no routing for the schedules copy.
2. `product/plans/complete/05-scripts-plugin-server.md`, Design decisions line 14 ("A shared test pins the shapes to the host's types") and Tests line 55 ("assigns each type to the other in both directions, so a field added to one shape and not the other fails to compile"). Neither held. The test file is outside every typecheck gate, and its runtime assertions compare the copy with itself. Commit `09b0c79f` moved the compile-time pin to `src/schedule/system/runscript-rows.ts`. Line 14 also weighs only R1 against R3.

## Implementation

No code change. The run's steps were: this plan written to `draft/`, moved to `ready/`, and promoted to `complete/`; the resolved entry removed from `product/backlog/pull-request.md`, which is then the master skeleton. No source, test, config, or spec file changed, so `check-diff` was not needed.

## Tests

None. The change records a decision in plan prose and removes a backlog entry. It changes no behavior, and the existing guard and pin tests are unaffected. Each claim was checked by reading, as listed under Verification.

## Verification

By reading, on the branch at `a803b7ae`: each path and line cited above exists and says what this plan says. The guideline lines are `plugins-tabs.md` 10, 78, 82, and 124; `plugins.md` 105, 149, and 157; and `architecture-principles.md` 59. The boundary regex is `eslint.plugin-boundaries.mjs` line 33. The tsconfig include and exclude are root lines 14-15, and the web include is line 15. `git diff --stat origin/master...HEAD` shows no change to `product/backlog/technical-debt.md` on the branch, so the schedules routing is not present.

## Out of scope

- Settling R1 through R5. That is the owner's decision in `ai/guidelines/`.
- Editing `scripts-shape-pin-typecheck.md`, `05-scripts-plugin-server.md`, or `technical-debt.md`.
- Replacing the scripts or schedules copies with re-exports, or changing `src/plugins/api.ts`.
- The thirteen shared contracts that import runtime guards from `../api.js`. Master's technical-debt entry tracks them.
