# Profile-level notifications tab

## Complexity

4/10 — mirrors the existing `_files.json` profile-level file-navigator mechanism (loader + opener + reserved file), which is a well-established pattern in the codebase. No new architecture; a straight parallel of `loadProfileFiles`/`openProfileFiles`.

## Goal

Make the `claude` profile launch the notifications tab, docked into the right sidebar, whenever `profile launch claude` runs.

## Background

A profile can already open non-entry tabs through reserved, underscore-prefixed files:

- `_monitors.json` → profile-level monitors (`loadProfileMonitors` / `startProfileMonitors`)
- `_files.json` → profile-level file-navigator tabs (`loadProfileFiles` / `openProfileFiles`)

There is no equivalent for the singleton notifications tab, which is otherwise opened/docked by the `notifications [left|right]` command via `openNotificationsTab(managers, dock)`. A harness entry's `run` list can't do it — those commands are typed into the harness's own terminal, not run as janissary commands.

## Approach

Add a third reserved file, `_notifications.json`, following the `_files.json` shape and mechanism exactly:

1. **Type** — add `ProfileNotificationsEntry = { dock?: 'left' | 'right' }` to `src/types.ts`.
2. **Loader** — add `loadProfileNotifications(name)` to `src/profiles.ts`, with an `isProfileNotificationsEntry` validator, mirroring `loadProfileFiles`/`isProfileFilesEntry`. Returns `[]` when the file is absent, unparseable, or not an array; malformed elements are dropped.
3. **Opener** — add `src/profile/notifications.ts` exporting `openProfileNotifications(profileName, managers, notes)`, mirroring `openProfileFiles`. For each entry it calls `openNotificationsTab(managers, entry.dock)` and pushes a note (`Opened notifications` / `Opened notifications (docked right)`).
4. **Wire-in** — call `openProfileNotifications(name, managers, notes)` in `openProfileEntries` (`src/profile/agent-opener.ts`), right after `openProfileFiles`, so the tab is present before the launch report is built. (Notifications targets nothing tab-specific, so ordering relative to monitors is immaterial, but keeping it next to the file-navigator step reads clearly.)
5. **Profile data** — add `profiles/claude/_notifications.json` = `[{ "dock": "right" }]`.

The notifications tab is a singleton, so authoring more than one entry simply re-docks the same tab; the array shape is kept only for parity with `_files.json`.

## Implementation steps

1. Add the `ProfileNotificationsEntry` type in `src/types.ts` next to `ProfileFilesEntry`, with a matching doc comment.
2. Add `isProfileNotificationsEntry` + `loadProfileNotifications` in `src/profiles.ts`.
3. Create `src/profile/notifications.ts` with `openProfileNotifications`.
4. Call it from `openProfileEntries` in `src/profile/agent-opener.ts`.
5. Add `profiles/claude/_notifications.json`.

## Tests

- `src/profiles.test.ts` — extend the profile-directory suite (mirroring the `_files.json` cases):
  - loads notifications entries from `_notifications.json`
  - returns `[]` when the file is absent, unparseable, or not an array
  - drops malformed elements (bad `dock` value)
  - `_notifications.json` is never loaded as a profile entry
- `src/profile/notifications.test.ts` — new file mirroring `src/profile/files.test.ts`:
  - opens a docked notifications tab and records the docked note
  - opens an undocked notifications tab and records the plain note
  - does nothing when the profile has no `_notifications.json`

## Spec

Update `product/specs/profiles.md`: add a "Profile-level notifications tab" subsection describing the reserved `_notifications.json` file and its `{ dock? }` shape, parallel to the existing "Profile-level file navigator" subsection.

## Out of scope

- Changing the `notifications` command or the notifications tab itself.
- Any `in`-style rooting (notifications is a singleton feed with no cwd), so no `in` field.
- Generalizing the three reserved-file mechanisms into one loader.
