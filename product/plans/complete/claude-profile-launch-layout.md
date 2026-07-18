# Build out the claude profile launch layout

**Complexity: 6/10** — the profile data rewrite is trivial, but the issue asks for two things the profile-reserved-file machinery cannot yet express: a docked **schedules** tab, and a file navigator rooted at **`$root`** rather than at an opened tab's cwd. Both are small, mirrored extensions of the existing `_notifications.json` / `_files.json` patterns (loader + type + opener + wiring + spec + tests), not new architecture.

## Goal

Make `profile launch claude` open the full workspace the issue describes:

- file navigator rooted at `$root`, docked left
- notifications tab, docked right
- schedules tab, docked right
- four claude harness tabs on group 1: `new features` (sonnet, medium effort), `debugging` (fable, high effort), `issues` (sonnet, medium effort), `planning` (opus, medium effort)
- an `assistant` monitor watching group 1

Today the `claude` profile has a single harness entry, a left file navigator (rooted at the first opened tab, i.e. a workspace clone — not `$root`), a right notifications tab, and the assistant monitor. Two capabilities are missing: there is no profile-level schedules tab, and `_files.json` cannot root at a literal path.

## Approach

Two code capabilities, then the profile data.

**1. Profile-level schedules tab (`_schedules.json`).** Mirror the existing `_notifications.json` path end-to-end. A reserved `_schedules.json` file — a JSON array of `{ dock? }` — opens (or docks) the singleton schedules tab once every profile entry is open, exactly like notifications. The singleton `openSchedulesTab(managers, dock)` already exists in `src/schedules-tab.ts`; this only adds the loader, type, profile opener, and one wiring call.

**2. `path` support in `_files.json`.** Add an optional `path` field to `ProfileFilesEntry`. When set, `openProfileFiles` appends it to the built `files` command *after* the `in`/`on` clauses (so `files on left $root` parses as dock=left, target=`$root`). The file-tree `open` command already expands `$root` to the launch dir via `expandUserPath`, so no new path logic is needed — an absolute `$root` root is independent of the tab the command is issued from, while the default label is still used for output. Relative-order matters: clauses must precede the path in the emitted string, which is what `parseFileTreeArgs` expects.

**3. Profile data.** Delete `profiles/claude/claude.json`; add four harness entries; point `_files.json` at `$root`; add `_schedules.json`. `_notifications.json` and `_monitors.json` already match the issue.

## Implementation

1. **`src/types.ts`** — add `export type ProfileSchedulesEntry = { dock?: 'left' | 'right' };` with a doc comment mirroring `ProfileNotificationsEntry`. Add an optional `path?: string` to `ProfileFilesEntry` and extend its doc comment (path roots the tree at a literal path, expanded like the `files` command's path argument, e.g. `$root`).

2. **`src/profile-reserved-files.ts`** — add `isProfileSchedulesEntry` + `loadProfileSchedules(profileDir)` mirroring the notifications pair. Extend `isProfileFilesEntry` to accept an optional `path` string.

3. **`src/profiles.ts`** — re-export `loadProfileSchedules` (wrapping `loadReservedSchedules(profilePath(name))`), mirroring `loadProfileNotifications`.

4. **`src/profile/schedules.ts`** (new) — `openProfileSchedules(profileName, managers, notes)` mirroring `openProfileNotifications`, calling `openSchedulesTab(managers, entry.dock)` and pushing `Opened schedules${dock ? ' (docked X)' : ''}.`.

5. **`src/profile/files.ts`** — build the command as `files [in <in>] [on <dock>] [<path>]`: append `entry.path` (trimmed) to the clause list, keeping clauses first. Note text unchanged.

6. **`src/profile/agent-opener.ts`** — import `openProfileSchedules` and call it right after `openProfileNotifications(...)`, before `startProfileMonitors(...)`.

7. **Profile data under `profiles/claude/`**:
   - delete `claude.json`
   - `new-features.json`: `{ "harness": "claude", "workspace": true, "autoApprove": true, "model": "claude-sonnet-5", "effort": "medium", "number": 1, "group": 1 }`
   - `debugging.json`: same shape, `model` `claude-fable-5`, `effort` `high`, `number` 2
   - `issues.json`: `model` `claude-sonnet-5`, `effort` `medium`, `number` 3
   - `planning.json`: `model` `claude-opus-4-8`, `effort` `medium`, `number` 4
   - `_files.json`: `[{ "dock": "left", "path": "$root" }]`
   - `_schedules.json`: `[{ "dock": "right" }]`
   - `_notifications.json`, `_monitors.json`: unchanged

   The harness tabs keep `workspace: true` (each auto-approving harness needs a sandboxed clone), so rooting the navigator at `$root` — not a clone — is exactly why `path` is needed.

## Tests

- **`src/profile-reserved-files.test.ts`** (extend if present, else colocate): `loadProfileSchedules` returns the docked entry, drops malformed elements, and returns `[]` when absent/unparseable/not-an-array — mirroring the notifications loader tests. `loadProfileFiles` keeps a valid `path` and drops an entry whose `path` is a non-string.
- **`src/profile/schedules.test.ts`** (new) — mirror `notifications.test.ts`: opens a docked schedules tab and records `Opened schedules (docked right).`; opens undocked and records `Opened schedules.`; does nothing (no tab, no note) when `_schedules.json` is absent.
- **`src/profile/files.test.ts`** — add: with `{ dock: 'left', path: '$root' }` the built command is `files on left $root`; with `{ path: '$root' }` alone it is `files $root`; `path` combines with `in` as `files in other on right ./sub`.

Run `./scripts/run.mjs check-diff`.

## Out of scope

- Any change to the `schedules` / `files` / `notifications` interactive commands or their parsing — only the profile-launch openers change.
- Expanding `$root`/`path` support anywhere beyond `_files.json`.
- Reworking the harness launch, workspace, or monitor mechanics.

## Verification

- Run `./scripts/run.mjs check-diff`.
- Manual launch of the app to drive `profile launch claude` is not performed in this unattended environment; the openers are exercised end-to-end by the unit tests above. Note this in the report.
