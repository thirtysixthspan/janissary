# `profile save` captures open editor tabs; `profile launch` already re-opens them

**Complexity: 3/10** — extends an existing, well-precedented capture pattern (agent/harness entry writers in `save-entries.ts`, routed through `save-route.ts`) to one more tab kind; the launch/re-open side (`editors` key, `openProfileEditors`) already exists and needs no change.

## Goal

Per the backlog: "the profile save command should save the open files to the profile and profile launch should re-open them. the paths of the files should be relative paths starting with $root." `profile save` already captures agent and harness tabs, and profiles can already declare editor tabs to open on launch via the `editors` key (`product/specs/profiles.md:42-46`, `src/profile/editors.ts`) — but the save side never captures them: `captureTab` (`src/profile/save-route.ts:32-69`) has no `case 'editor'`, so every open plain-text editor tab falls into the `default` branch and is pushed to `state.skipped`, confirmed by the existing test `'skips image, editor, ssh, and non-docked file-navigator tabs, and reports them'` (`src/profile/save.test.ts:118`). This fix adds the missing capture side, reusing the on-disk `editors` array shape and `$root`-relative path convention the launch side already defines.

## Approach

Mirror `writeAgentEntry`/`writeHarnessEntry` (`src/profile/save-entries.ts`) with a new `writeEditorEntry`, and `abbreviatePath(path, { root: managers.tab.launchDir })` (already used there for `cwd`) for the path itself — it already produces exactly the `$root/...` form the issue asks for, is the documented inverse of the `$root` expansion `openProfileEditors`/`edit` already perform on load, and needs no new logic. Route `case 'editor':` in `captureTab` to it, accumulating into a new `editorEntries` array on `CaptureState`, parallel to `agentEntries`/`harnessEntries`. `saveProfile` writes `root.editors` when non-empty, exactly like `root.agents`/`root.harnesses`.

## Implementation steps

1. `src/profile/save-entries.ts`: add `writeEditorEntry(tab: Tab, managers: Managers): ProfileEditorsEntry | undefined`, returning `undefined` when `tab.editor` is absent (defensive, mirrors `writeHarnessEntry`'s `tab.harness` guard). Otherwise returns `{ path: abbreviatePath(tab.editor.path, { root: managers.tab.launchDir }), tab: { color: tab.dotColor, number: tab.number, focus: tab === managers.tab.tabs[managers.tab.activeTab] || undefined, group: tab.group, groupColor: tab.groupColor } }`.
2. `src/profile/save-route.ts`: add `editors: number` and `editorEntries: ProfileEditorsEntry[]` to `CaptureState` and `newCaptureState()`. Add a `case 'editor':` branch before `default` in `captureTab`, calling `writeEditorEntry`; on success push to `state.editorEntries` and increment `state.editors`, otherwise push to `state.skipped` (mirrors the harness branch's `entry`-guarded push).
3. `src/profile/save.ts`: in `saveProfile`, add `if (state.editorEntries.length > 0) root.editors = state.editorEntries;` alongside the existing conditional section assignments. Add `editors: state.editors` to the returned `SaveSummary` and to the `SaveSummary` type itself.
4. `src/profile/save.ts`'s `formatSaveSummary`: add an `editor tab`/`editor tabs` count to `parts`, alongside the existing `agents`/`harnesses` count lines (same singular/plural pattern).

## Tests

In `src/profile/save.test.ts`:

- Update `'skips image, editor, ssh, and non-docked file-navigator tabs, and reports them'` to remove the `editor` tab from its fixture and expected `skipped` list (image, ssh, and undocked-files remain skipped) — editor tabs are no longer skipped.
- Add `'writes an editor entry with a nested tab object'` — mirrors the existing agent-entry test (`:58`), asserting `load('demo').editors` contains one entry with `path` and the nested `tab` object.
- Add `'writes an editor entry path relative to the project root when it is under the root'` — mirrors the existing agent-entry cwd test (`:99`), asserting the path comes back as `$root/...`.
- Add `'writes focus only on the active main-area tab'`'s existing assertion (`:85`) — extend that test's fixture with an editor tab to confirm `focus` is correctly `undefined`/`true` alongside agent and harness entries.
- Add an assertion (in a new or the "omits empty config sections" test, `:167`) that `summary.editors` reflects the captured count and `loaded.editors` round-trips through `loadProfile`.

Run `./scripts/run.mjs check-diff` to confirm.

## Spec updates

`product/specs/profiles.md`:
- Line 91 — replace "The active agent or harness entry is saved with `tab.focus: true`... Editor tabs remain launch-only and are skipped during capture." with a sentence stating editor tabs are now captured too, alongside agents and harnesses, using the same `editors` array and `$root`-relative path convention the launch side already documents (Profile-level editor tabs, lines 42-46).
- Line 103 — remove "a text editor" from the list of tab kinds left out of a saved profile (image, web page, markdown viewer, ssh connection, monitor reporting tab, and undocked file navigator remain skipped).
- Line 105 — add editor-tab counts to the list of what the save summary reports.

## Out of scope

- Capturing cursor line/position for an editor tab — the server has no live cursor-position state to capture; a relaunched editor entry opens at the file's start (or wherever `line` — left unset — would otherwise place it), same as any hand-authored `editors` entry without `line`.
- Synced editor tabs (files opened from the shared git-sync workspace clone, outside the project root) — their captured path won't collapse to `$root` since it lives outside `launchDir`, and re-opening that literal path on launch won't re-trigger sync detection. The issue only asks about ordinary open files' `$root`-relative paths; synced-tab round-tripping is a separate, unaddressed concern.
- Markdown, image, or web-page view tabs — the issue asks specifically about "the open files" (the plain-text editor), matching the existing `editors` launch-side key; those other view kinds have no profile-entry equivalent at all and stay skipped.
