# diff on clause still-provisioning refusal

**Complexity: 4/10** — one new field on the `originTab` record, one extra route in the diff plugin's resolution, and the tests that pin both; no new capability and no protocol change.

`diff on <tab name>` names an open tab's workspace. The plan promises two refusals: one for a tab with no workspace at all, and one for a tab whose workspace is still landing. Only the first is delivered. A local shell's `workspaceDir` is set the moment its tab opens, before the clone exists, so a command typed while the clone lands resolves the tab as workspaced, opens the diff tab, and its first read answers `not-repository` — which a workspace diff treats as the workspace being gone and closes itself over. The user watches a tab open and vanish, and the refusal they are given names a problem the tab does not have.

## Goal

`diff on <name>` while that tab's workspace is still landing answers `Cannot diff on <name>: the workspace of "<name>" is still being prepared.` on the transcript it was typed in, and opens no tab — the wording and the route the plan already records.

## Approach

The plugin cannot tell a tab still cloning from one that will never clone, because the record `originTab` answers carries the workspace directory and nothing about its state. Add the flag to the record rather than asking the plugin to read host state: the host already knows — `managers.workspace.provisioning(dir)` for a local tab, and the channel's own workspace-absence test (no directory until the far side answers, read the way `buildTabView` reads it for the metadata row's spinner) for a remote one.

## Implementation steps

1. `src/plugins/line-capabilities.ts` — the record `originTab` returns gains `provisioning?: boolean`, set when the workspace it names has not landed: `managers.workspace.provisioning(workspaceDir)` for a local tab, and the channel's own test (`workspaceOf(label) === undefined` with a `remote` target) for a remote one. Omitted entirely for a tab whose workspace is settled, so an existing caller's structural reads do not change.
2. `src/plugins/api.ts` — name the field in the `originTab` contract, beside the `workspace` field it qualifies and the `remote` field that decides which of the two it is read from. Additive, so `TAB_PLUGIN_API_VERSION` stays at 2.
3. `src/plugins/diff/activate.ts` — `resolveWorkspace` answers a third kind, `provisioning`, for a record carrying a workspace that has not landed, and the command handler refuses with the plan's wording before any tab is opened. The local and remote routes are unchanged.
4. `src/plugins/diff/manifest.ts` — no change; the capability is already declared.

## Tests

- `src/plugins/context.test.ts`, in the `originTab with a label` block — a local tab whose `managers.workspace.provisioning` answers true reports `provisioning: true` and the settled one omits the field, and a remote tab whose channel has answered no workspace directory reports it while the one it answered does not.
- `src/plugins/shell-capabilities.test.ts`, in the `originTab` block — the existing remote case's fixture gains the channel its mock never had (which previously answered `undefined` for a directory), plus a case asserting a remote tab with no directory reports the flag.
- `src/plugins/diff/activate.test.ts` — `diff on <name>` for a record carrying a workspace plus the flag refuses with the exact wording and calls neither `openOrFocusTab` nor `launchTab`; a remote record whose far side has not answered refuses the same way; the settled record beside them still opens the tab.

## Out of scope

- The metadata button's provisioning guard in `src/plugins/host.ts`, which the host applies before the plugin is called at all. That route is untouched.
- The `openSibling` hook's own behavior, and the sessions row's action list, which already keeps `diff` off a channel that has not landed its workspace.

## Verification

`./scripts/run.mjs check-diff`, plus a manual check: a `zsh -w <name>` whose clone is still landing, `diff on <name>` in another tab, and the refusal line on that transcript; then the same command once the workspace is ready, and the tab opening.

