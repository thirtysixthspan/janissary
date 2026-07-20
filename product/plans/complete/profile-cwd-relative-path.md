# Save/launch profile `cwd` as a project-relative path

**Complexity: 2/10** — the codebase already has the exact inverse-pair utility this needs (`abbreviatePath`/`expandUserPath` in `src/paths.ts`), already used the same way for the `files` command's path argument and `_files.json`'s `path` field. This is wiring, not new mechanism.

## Goal

`profile save <name>` currently writes each agent/harness entry's `cwd` as a raw absolute path (`managers.tab.cwdOf(tab.label)` in `src/profile/save-entries.ts`). `profile launch <name>` then reads that `cwd` straight through as an absolute path (`src/profile/entry-openers.ts`). Because profiles are meant to be committable and shared (see "Storage" in `product/specs/profiles.md`), an absolute `cwd` baked in at save time only works back on the machine/directory layout it was saved from. Saved `cwd` should instead be written relative to the project root (`$root`, the same convention `_files.json`'s `path` and the `files` command's path argument already use), and `profile launch` should accept both the relative form and a legacy/foreign absolute path unchanged.

## Approach

Reuse `abbreviatePath`/`expandUserPath` from `src/paths.ts` exactly as `open-file-command.ts`, `open-file-manager.ts`, and `file-tree/open-command.ts` already do — all three resolve against `managers.tab.launchDir`. No new types, no schema change: `AgentState.cwd`/`ProfileHarnessEntry.cwd` stay `string | undefined`; only the string's shape changes (project-relative `$root/...` when under the root, `~/...` when under home, unchanged otherwise — `abbreviatePath` already returns the input unchanged when neither prefix applies, so a cwd outside both stays a plain absolute path).

- **Save side** (`src/profile/save-entries.ts`): when writing `cwd` in `writeAgentEntry` and `writeHarnessEntry`, run it through `abbreviatePath(cwd, { root: managers.tab.launchDir })` before putting it on the entry.
- **Launch side** (`src/profile/entry-openers.ts`): when consuming `state.cwd` in `openAgentEntry` and `entry.cwd` in `openHarnessEntry`, run it through `expandUserPath(cwd, { root: managers.tab.launchDir })` before calling `managers.tab.setCwd`/passing it into `openFromProfile`. A profile entry's `cwd` was always allowed to be hand-authored (see the `cwd` bullet in `product/specs/profiles.md`'s entry-schema list), so this also means a hand-written `$root/...` or `~/...` cwd in a profile file now resolves — previously it would have been used as a literal (broken) relative path.
- No change to `_files.json`'s `path` field or the `files` command — those already go through this exact expand/abbreviate convention.

## Implementation steps

1. In `src/profile/save-entries.ts`, import `abbreviatePath` from `../paths.js`. In `writeAgentEntry`, change `cwd: managers.tab.cwdOf(tab.label)` to abbreviate the result (guard for `undefined` — `cwdOf` can return `undefined`). Same in `writeHarnessEntry`.
2. In `src/profile/entry-openers.ts`, import `expandUserPath` from `../paths.js`. In `openAgentEntry`, expand `state.cwd` before the `managers.tab.setCwd(state.name, state.cwd)` call. In `openHarnessEntry`, expand `entry.cwd` before it's folded into `withCwd` (so `openFromProfile` and its `resolveCwd` fallback chain always see an absolute path).
3. Run `./scripts/run.mjs check-diff`.

## Tests

- `src/profile/save.test.ts`: extend the existing agent-entry and harness-entry tests (or add new ones) asserting that a `cwd` under the test's `launchDir`/root is written as `$root/...`, and a `cwd` outside the root (e.g. under a different temp dir) is written unchanged as an absolute path. The existing `makeManagers` test helper needs a `launchDir` on its fake `tab` manager.
- `src/profile/entry-openers.test.ts` (or wherever `openAgentEntry`/`openHarnessEntry` are already tested — check first, extend if present, else colocate a new one following that file's conventions): a `$root/...` cwd in an `AgentState`/`ProfileHarnessEntry` resolves to the absolute path under the fake `launchDir` before being passed to `setCwd`/`openFromProfile`; a legacy absolute `cwd` (no `$root`/`~` prefix) passes through unchanged.

## Spec updates

`product/specs/profiles.md` line 21, the `cwd` bullet in the harness-entry schema list: note it accepts `$root`/`~`-relative forms (same expansion as the `files` command's path argument), not just an absolute path. Also touch the "Save the current session" (`profile save <name>`) section's mention of "starting directory" to note it's captured relative to the project root when under it.

## Out of scope

- `_files.json`'s `path` field and the `files` command's own path handling — already use this convention, untouched.
- Any change to the `AgentState`/`ProfileHarnessEntry` schema shape (`cwd` stays an optional string).
- Migrating already-saved profiles with absolute-path `cwd` values — `expandUserPath` returns an unrecognized-prefix string unchanged, so old profiles keep working without modification.

## Verification

- Run `./scripts/run.mjs check-diff` after each change.
- Manual check: from the project root, open an agent tab, `cd` it somewhere under the project (e.g. `src/`), run `profile save demo`, and confirm the written `<label>.json`'s `cwd` reads `$root/src` rather than an absolute path. Then `profile launch demo` and confirm the reopened tab's cwd resolves back to the same absolute directory.
