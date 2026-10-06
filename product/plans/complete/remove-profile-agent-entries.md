# Remove profile agent entries

**Complexity: 5/10** — the launcher, loader, schema, and saver each lose one entry kind, but the kind is threaded through shared types (`ProfileEntry`, `LoadedProfile`, `SaveSummary`), three built-in profiles, the docs-screenshot reset and its demo fixture, about thirty tests that use an agent entry as filler, two specs, one docs page, a backlog entry, and two deferred plans.

## Goal

A profile can no longer open agent tabs. After this change, a `"type": "agent"` element of a profile's `tabs` array opens nothing, `profile save` no longer writes agent tabs into the file, and every remaining entry kind — `harness`, `editor`, `files`, `notifications`, `schedules`, `plugin`, `image`, `markdown`, `page`, `ssh` — plus `monitors` and `layout` keeps working exactly as before.

## Approach

Agent entries are removed from the four places a profile is handled:

- **Launch** (`src/profile/agent-opener.ts`, `src/profile/entry-openers.ts`, `src/profile/entry-resolve.ts`): `openAgentEntry` and the harness/agent branch go; every runtime entry is a harness entry.
- **Load and validate** (`src/profile/file.ts`, `src/profile/schema.ts`, `src/profile/schema-tab-entry.ts`): an element whose `type` is `agent` is accepted without any field check and dropped before partitioning. `agent` is not a member of the `ProfileTabFile` union and is not listed in the `type must be one of …` message.
- **Save** (`src/profile/save/*.ts`): an agent tab is left out of the file and listed by its bare label under `Skipped:`; the root `janus` tab stays silently omitted. The `agents` count leaves the save report.
- **Types** (`src/profile/types.ts`): `ProfileAgentEntry`, `ProfileAgentTabFile`, and the `ProfileEntry` union go; `LoadedProfile.entries` is `ProfileHarnessEntry[]`.

The typed `agent` command, `--relaunch` agent-state restore, `placeAgent`, `startRemoteAgent` (typed `agent … on` and session attach), and `newAgentOp` stay — they are separate features that only live beside the profile code. Their `presentation` option existed only for the profile launch and goes with it.

## Scope decisions

1. **Saving an agent tab** — left out of the profile file and named by its bare label in the report's `Skipped:` list (`Skipped: bob.`), like any other tab with no profile equivalent. The root `janus` tab remains silently omitted.
2. **Profile files already on disk** — a `"type": "agent"` element is ignored: `profile launch` drops it silently and opens the rest; nothing about it appears in the launch report.
3. **Validation of agent elements** — accepted unchecked: any object with `type: "agent"` passes `profile validate` and the launch's structural check regardless of its other fields. `agent` is removed from the `type must be one of …` list. All agent field-checking code goes.
4. **Specs and docs about ignored agent elements** — neither the spec nor the docs mention that agent elements are ignored; only code and tests carry it.
5. **Docs-screenshot reset (deep tie)** — detached: `scripts/docs-screenshots/reset.mjs` types `agent janus --no-workspace` from the staging tab instead of writing and launching the one-agent `docs-screenshot-reset` profile. The recreated root tab keeps label `janus`, group 1, and the blue group border (inherited from the staging tab's group), but its dot is `distinctColor`'s pick rather than the launch blue. `product/specs/docs-screenshots.md` is updated to match.
6. **Built-in profiles** — `profiles/multitasking.json` and `profiles/product-review.json` lose their `janus` agent entry (no focus is moved; the first newly opened tab stays active). `profiles/debugging.json` replaces its `terminal` agent entry with `{ "type": "plugin", "id": "shell", "color": "#ffd93d", "number": 4, "group": 1, "groupColor": "#5b9cff" }`, which reissues the shell plugin's `zsh` command.
7. **Filler tests** — a test of remaining behaviour that uses an agent entry or agent tab only as filler has that filler swapped for a harness or editor entry (on save, a harness tab), keeping every assertion about the remaining behaviour. Assertions about agent entries themselves, and tests only about agent entries, are deleted.
8. **Demo fixture** — `scripts/docs-screenshots/fixtures/profiles/demo.json` becomes two editor entries on `$root/src/app.ts` and `$root/src/tides.ts`, keeping the same numbers, group, colors, and focus.
9. **Screenshots** — the two shots that launch the demo profile, `tabs-groups` and `profile-group`, are regenerated and committed. Other tab-strip shots are left as they are.
10. **Wording** — docs page intro reads "a saved, named set of harnesses and other tabs"; spec opening reads "a reusable, named set of AI harnesses and the tabs that support them"; `tabs.md` "Profiles form a group" says "all of that profile's tabs … the first launched tab's color"; `agents.md` drops "or a profile entry's name"; `why-janissary.md` is unchanged.
11. **`src/profiles.ts` header comment** — rewritten to describe the single `tabs` array without agents.
12. **Backlog** — `product/backlog/features.md`'s workflows entry parenthetical changes "agents, harnesses, layout" to "harnesses, editors, layout". No backlog entry concerns only the removed feature.
13. **Deferred plans** — `product/plans/deferred/profile-gallery.md` drops the `coding` profile (its table row, section, and the "schedule/context for agent entries" phrase). `product/plans/deferred/remote-agents.md` has its agent path rewritten to reach remote agents through the typed `agent … on <address>` command instead of profile agent entries.

14. **Reset colour variance (found during removal)** — `distinctColor` picks the root tab's dot from the staging tab's colour, which follows from whichever tab the previous shot left open, so the dot varies between shots (cyan in `tabs-groups`, orange in `profile-group` in the regeneration run). Accepted: the reset keeps the single hop, and `product/specs/docs-screenshots.md` says the root tab's dot colour is the one thing a subset run may not reproduce. A fixed seven-hop sequence that lands on the launch blue from any palette colour was considered and declined.

15. **Unrelated CSS gate fix (found at the PR gate)** — `pr-check-gate` failed on three pre-existing `length-zero-no-unit` stylelint errors from #1526: the `var(--command-bar-height, 0px)` fallbacks in `web/src/theme.css` and `web/src/plugins/shell/shell.css`. Fixed by hand here, `0px` → `0`, which renders identically, so the PR can open on a green gate. Three assertions that pinned the old text — `web/src/plugins/shell/ShellTab.test.tsx` (two) and `web/src/pickers/picker-positioning.test.ts` (one) — are updated to `0` to match, with the user's approval.

Already decided by the task, not asked: a removed name behaves as if it never existed; data on users' machines is tolerated, never migrated; no extension contract is involved; completed plans and the changelog are untouched.

## Implementation steps

1. **Types** — `src/profile/types.ts`: delete `ProfileAgentEntry`, `ProfileEntry`, `ProfileAgentTabFile` and its union member; `LoadedProfile.entries` becomes `ProfileHarnessEntry[]`; update comments that contrast harness entries with agent entries.
2. **Schema** — `src/profile/schema.ts`: drop `agent` from `TAB_KINDS`; export `isIgnoredTab(value)` (an object whose `type` is `agent`); `tabProblems` returns `[]` for it before the kind check. `src/profile/schema-tab-entry.ts`: delete `agentProblems`. `src/profile/schema-fields.ts`: drop the `'object[]'` kind, which only `agentProblems` used.
3. **Loader** — `src/profile/file.ts`: filter `isIgnoredTab` elements out before `partitionTabs`; delete the `agent` case.
4. **Launcher** — `src/profile/entry-openers.ts`: delete `openAgentEntry` and its imports. `src/profile/entry-resolve.ts`: delete `isHarnessEntry`; type the helpers on `ProfileHarnessEntry`. `src/profile/agent-opener.ts`: every entry goes through `openHarnessEntry`; comments no longer mention agent entries.
5. **Shared agent creation** — `src/profile/place-agent.ts`: delete the `presentation` option. `src/profile/remote-agent.ts`: delete `RemoteAgentLaunch.presentation` and the profile-launch wording in its comment.
6. **Saver** — `src/profile/save/entries.ts`: delete `writeAgentEntry`. `src/profile/save/route.ts`: the agent case skips the root `janus` tab silently and pushes every other agent tab's label to `skipped`; delete the `agents` counter. `src/profile/save/index.ts`: delete `SaveSummary.agents` and its report part.
7. **Built-in profiles** — edit `profiles/debugging.json`, `profiles/multitasking.json`, `profiles/product-review.json` per decision 6.
8. **`src/profiles.ts`** — rewrite the header comment per decision 11.
9. **Docs-screenshot reset** — `scripts/docs-screenshots/reset.mjs`: delete `resetProfile`, `writeResetProfile`, `RESET_PROFILE`, `ROOT_COLOR`, and the `writeProfile` option; type `agent janus --no-workspace` from the staging tab; rewrite the comments. `scripts/docs-screenshots/fixtures/profiles/demo.json` per decision 8.
10. **Tests** — per decision 7 (see Tests).
11. **Specs and docs** — see Spec updates.
12. **Backlog and deferred plans** — per decisions 12 and 13.
13. **Screenshots** — build the web bundle and run `./scripts/run.mjs docs-screenshots tabs-groups profile-group`; commit the two PNGs.

## Tests

Deleted (only about agent entries):

- `src/profile/entry-openers.test.ts` — every `openAgentEntry` describe block.
- `src/profile/remote-agent.test.ts` — the two profile-entry tests ("reopens a profile entry's remote agent …", "reports and skips a profile entry whose remote address is unusable").
- `src/profile/agent-opener.test.ts` — "inserts an agent entry contiguously …", "expands a $root-relative agent entry cwd …".
- `src/profile/file.test.ts` — the agent `name`/mistyped-field/well-typed tests.
- `src/profile/save/index.test.ts` — "writes one clean-template agent entry …", "writes an agent entry cwd relative …", "writes a remote agent entry …".
- `scripts/docs-screenshots/reset.test.mjs` — "declares one focused agent entry …".

Filler swapped (assertions about remaining behaviour kept): the incidental tests in `src/profile/agent-opener.test.ts`, `file.test.ts`, `schema.test.ts`, `validate.test.ts`, `manager.test.ts`, `save/index.test.ts` (including `formatSaveSummary`'s count wording), `src/profiles.test.ts`, and `src/controller.test.ts`.

Changed or added for the new behaviour:

- `src/profile/file.test.ts` — a `type: "agent"` element, even one with mistyped fields, loads with no runtime entry and does not make the file malformed.
- `src/profile/validate.test.ts` — the `type must be one of …` message no longer lists `agent`; a file with an agent element validates.
- `src/profile/save/index.test.ts` — an agent tab is not written and is listed under `skipped`; the root `janus` tab is neither written nor listed (the existing janus tests, re-pointed at `skipped`).
- `scripts/docs-screenshots/reset.test.mjs` — the fake app recognizes `agent janus --no-workspace`; the choreography test asserts that command is typed from the staging tab, and the write-profile assertions go with the option.

## Spec updates

- `product/specs/profiles.md` — remove agent entries throughout: opening sentence (decision 10), the type list, the agent-entry paragraph, strip-entry list, malformed examples, launch paragraph, name clashes, validate message, save sections (agent tabs listed under `Skipped:`, remote capture, clean-template wording, counts), and the `profile` command summary.
- `product/specs/tabs.md` — "Profiles form a group" wording (decision 10).
- `product/specs/agents.md` — drop "or a profile entry's name".
- `product/specs/docs-screenshots.md` — the reset recreates `janus` by typing the agent command; its dot is no longer the root tab's blue.
- `documentation/user-documentation/automation/profiles.md` — intro (decision 10), the launch paragraph's agent sentence, the `name` sentence, both JSON examples' agent lines, the type count and list, the agent-state sentence, the agent `remote` paragraph, and the save section (agent tabs are listed as skipped; harness clean-template wording).

## Verification

Checks (Step 2 discovery, Janissary checkout):

- Fast check after each step: `./scripts/run.mjs check-diff`.
- Full: `npm run typecheck`, `npm run lint`, `npm test`, `npm run docs:build` (a docs page is edited), each as green as the baseline. Baseline: typecheck clean; lint 0 errors, 1 warning; tests 828 files passed, 12136 tests passed, 1 skipped.
- Dead-code: `npm run knip`, compared against this baseline:

```
Unlisted binaries (6)
gitleaks      package.json
opengrep      package.json
mkfifo        src/notifications/record.test.ts
sandbox-exec  src/sandbox/keychain.sandbox.test.ts
sandbox-exec  src/sandbox/opencode-models.sandbox.test.ts
getconf       src/sandbox/resolve.ts
Unresolved imports (4)
.../workspace/manager.js  src/git/sync.test.ts:2:39
./config.js               src/notifications/index.test.ts:2:41
./managers.js             src/notifications/index.test.ts:3:31
../protocol.js            src/plugins/shell/shared.test.ts:2:59
Unused exports (5)
SEARCH_INSTANCE_KEY            src/plugins/search/session.ts:163:26
size                 function  web/src/overlay-plugins/clipboard-history/store.ts:67:17
isEdited             function  web/src/plugins/image/edit-model.ts:55:17
isNullCell           function  web/src/plugins/sql/grid-view.ts:171:17
currentObject        function  web/src/plugins/sql/grid-view.ts:193:17
Unused exported types (3)
ClearFiltersIntent  type  src/plugins/sql/shared-intents.ts:25:13
RefreshIntent       type  src/plugins/sql/shared-intents.ts:29:13
OverlayPluginItems  type  web/src/overlay-plugins/api.ts:65:13
Configuration hints (2)
web/src/env.d.ts    knip.json  Remove from ignore
open                knip.json  Remove from ignoreBinaries
```

Live checks, in one scratch instance driven by the e2e driver (a browser is attached to this tab):

- **Profile launch, detached from agent entries** — a project profile with an agent element (mistyped fields included), an editor entry, and a shell plugin entry: `profile validate` reports it valid; `profile launch` opens the editor and shell tabs, no agent tab, and the report mentions no agent.
- **Profile save, detached from agent entries** — with an extra agent tab open, `profile save` reports it under `Skipped:` by label, writes no `agent` element, and does not list the root `janus` tab.
- **Built-in `debugging` profile's shell entry** — exercised by the same `plugin`/`shell` entry shape above.
- **Docs-screenshot reset** — exercised by regenerating `tabs-groups` and `profile-group` (step 13), which runs the reset before each shot.

Results (scratch instance on the working tree at `699aec61` plus the removal, driven through the attached browser):

- Profile launch — passed. `profile validate live` printed `Profile "live" is valid.` for a file whose agent element carried a non-boolean `active`, a numeric `cwd`, and a non-object `log`. `profile launch live` opened `notes.md` and a shell tab, opened no `ghost` tab, and reported only `Opened editor tab. Opened shell tab.`
- Profile save — passed. With an extra `bob` agent tab open, `profile save saved` reported `Saved profile "saved": 1 editor tab, 1 plugin tab, layout. Window size not captured (no window open). Skipped: bob.`, and the file held only an `editor` and a `plugin` (`shell`) element; the root `janus` tab was neither written nor listed.
- Built-in `debugging` shell entry — passed through the same `{ "type": "plugin", "id": "shell" }` shape, which opened a shell tab.
- Docs-screenshot reset — passed: both shots captured, each after a reset that left exactly one `janus` tab.
- Full checks after the removal: typecheck clean; lint 0 errors, the same 1 pre-existing warning; tests 828 files passed, 12111 tests passed, 1 skipped; `npm run docs:build` passed. `npm run knip` reported exactly the baseline above — no new finding.

## Out of scope

- Any migration or cleanup of profile files on users' machines; old agent elements are simply ignored.
- Regenerating tab-strip screenshots other than the two demo shots, even though their root-tab dot will change on their next regeneration.
- A way to set a new tab's dot color from a typed command.
- `product/plans/complete/*` and `CHANGELOG.md`, which are historical records.
- `documentation/user-documentation/getting-started/why-janissary.md`, whose "multi-agent setups" wording still holds for harnesses.
