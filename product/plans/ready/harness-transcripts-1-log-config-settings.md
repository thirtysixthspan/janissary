# Add `logEnabled` and `logRetentionInDays` settings to `.janissary/config.json` with backfill

**Complexity: 5/10** — 11 requirements, 14 test scenarios, ~25 added lines across 2 files (p=5.53)

## Goal

The harness transcript feature needs two new settings in `.janissary/config.json`: `logRetentionInDays`, the number of days a harness transcript is kept, and `logEnabled`, a switch that stops harness transcripts being written at all. This subplan adds both settings to `Config`, decodes them with fallbacks, and backfills them into an existing config file the way `maxToolTurns` is backfilled today. Nothing reads the two settings yet: the launch sweep that reads `logRetentionInDays` arrives in `product/plans/ready/harness-transcripts-4-retention-sweep.md`, and the write gate that reads `logEnabled` arrives in `product/plans/ready/harness-transcripts-5-log-enabled-gate.md`.

Source plan: `product/plans/complete/harness-transcripts.md` (implementation step 1 and the config parts of step 5). Run order: 1 of 5. Depends on no earlier subplan.

## Requirements

1. `.janissary/config.json` gains a `logRetentionInDays` setting (source Requirement 6; user answer: "logRetentionInDays").
2. `logRetentionInDays` defaults to `7` (source Requirement 7; user answer: "7 days").
3. A `logRetentionInDays` of `0` decodes to `0`, a valid value, not to the default (source Requirement 8, decode half; user answer: "0 = delete at launch").
4. A `logRetentionInDays` that is negative, fractional, or not a number falls back to `7` (source Requirement 9; user answer: "Other invalid values fall back to 7").
5. `.janissary/config.json` gains a `logEnabled` boolean setting defaulting to `true` (source Requirement 10; user answer: "add an additional parameter logEnabled that defaults to true").
6. A `logEnabled` that is not a boolean falls back to `true`, as every boolean setting does (source Requirement 11).
7. A config file that predates either key gains it, with its default, the next time it is loaded (source Requirement 15; user answer: "Backfill both keys").
8. That backfill keeps every other key already in the file, unknown keys included, with its value unchanged (source Requirement 15: "preserving every other key").
9. A failed backfill write prints nothing to stderr (source Requirement 16: "A failed backfill write is silent").
10. After a failed backfill write, the session still uses the decoded settings, both new defaults included (source Requirement 16: "the session still uses the decoded settings").
11. A config file that already holds `maxToolTurns`, `logEnabled`, and `logRetentionInDays` is not rewritten on load (source implementation step 1: "so it still proves a complete file is not rewritten").

## Design decisions

- Name the settings `logRetentionInDays` and `logEnabled` even though they govern only harness transcripts in this version (user answers: "logRetentionInDays"; "Harness transcripts only").
- Decode `logRetentionInDays` with a new private decoder `nonNegativeIntegerValue(value, fallback)` in `src/config-decode.ts`, placed directly after `positiveIntegerValue` and modeled on it. It returns the value when it is a number, a safe integer, and at least `0`, and the fallback for anything else, so `0` is valid while negatives, fractions, strings, `null`, and non-finite numbers fall back to `7` (user answer: "0 = delete at launch"; Existing functionality 1).
- Decode `logEnabled` with the existing `booleanValue` (Existing functionality 2).
- Add an exported `DEFAULT_LOG_RETENTION_IN_DAYS` constant of `7` in `src/config.ts` directly after `DEFAULT_MAX_TOOL_TURNS`, and put both defaults in `DEFAULT_CONFIG` so a fresh config file writes both keys out (Assumption 3). `src/config.test.ts` imports the constant the way it imports `DEFAULT_TRANSCRIPT_MAX_LINES`.
- Place the two fields directly after `recordShellTabs` in all three places that list settings: the `Config` type (after `recordShellTabs: boolean;`, before the comment block that follows it), `DEFAULT_CONFIG`, and the object `decodeConfig` returns. `logEnabled` comes first, then `logRetentionInDays`. A fresh file's key order follows `DEFAULT_CONFIG`, so this fixes where the keys land in it.
- Give each new `Config` field a short comment in the style of its neighbors that says what the value means (whether harness transcript files are written; how many days one is kept, with `0` keeping none from earlier runs). The comment names neither the transcript directory nor any reader, because subplan 3 moves the directory and subplans 4 and 5 add the readers. Point it at `product/specs/application-config.md` for what reads it.
- Replace `backfillMaxToolTurns` with `backfillMissingKeys(parsed, defaults)` in `src/config-decode.ts`, same signature and return type. It works over a private constant `BACKFILLED_KEYS` listing `maxToolTurns`, `logEnabled`, and `logRetentionInDays` in that order. It finds the missing keys the way `backfillNotificationAlerts` does, by `Object.hasOwn` on the raw record (Existing functionality 4). Missing keys are appended after the existing keys in list order. A key that is present with an invalid value is not missing and is left exactly as the user wrote it. When the parsed value is not a record, or no key is missing, it returns undefined (user answers: "Backfill both keys", "Generalize existing"; Assumption 4).
- Keep `loadConfig`'s single write path, its notification stripping, and its silent failure as they are; only the backfill call changes (Assumption 2).
- The two settings are decoded and backfilled here but read by nothing until subplans 4 and 5 land. That is safe: an unread setting changes no behavior.
- Update `product/specs/application-config.md` in this subplan for what it delivers: one table row per setting stating its type, default, decode fallback, and backfill, and the backfill and count-style sentences of the loading paragraph. What each setting governs is added to its row by the subplan that makes it govern something (subplan 4 for `logRetentionInDays`, subplan 5 for `logEnabled`).

## Preserved behavior

1. A config that predates `maxToolTurns` still gains it with its default while every other key, including unknown ones, is kept. It must not lose an unknown key or rewrite `transcriptMaxLines`. Test: `src/config.test.ts` "backfills max tool turns into an existing config that predates it".
2. An invalid-JSON config file is left on disk untouched and the session uses defaults. The backfill must not write over it. Test: `src/config.test.ts` "leaves an invalid JSON config untouched when loading".
3. A legacy `notifications` section is still moved out of `config.json` into `notifications.json`. The new backfill must not stop that strip or drop the section's contents. Test: `src/config.test.ts` "moves a legacy notifications section out of config.json into notifications.json".
4. An invalid `maxToolTurns` still falls back to `20` in memory while the raw value stays in the file. The backfill must not overwrite the user's raw value. Test: `src/config.test.ts` "falls back to 20 for the invalid max tool turns %p while keeping valid neighbors".
5. A fresh config file holds exactly the decoded config's keys and values, less `notifications`. It must not write a key the decoder drops, or write a default that differs from the decoded one. Test: `src/remote/serve-root-settle.test.ts` "runs the startup setup against the root and hands back a manager bound to it" (Assumption 9).

## Assumptions

1. `decodeConfig` decodes each setting independently with a fallback to the default: `src/config-decode.ts:106` `export function decodeConfig(value: unknown, defaults: Config): Config`.
2. `loadConfig` has a single backfill write path guarded by one `try`/`catch` that returns the decoded config on failure: `src/config.ts:132` `const backfilled = backfillMaxToolTurns(parsed, DEFAULT_CONFIG);` and `src/config.ts:139` `return config;`.
3. A fresh config file is written from `DEFAULT_CONFIG` with `notifications` deleted: `src/config.ts:120` `const initial: Config = { ...DEFAULT_CONFIG };`.
4. `backfillMaxToolTurns` has exactly one caller, `loadConfig`, and no test imports it: `src/config.ts:6` `import { backfillMaxToolTurns, configRecord, decodeConfig } from './config-decode.js';`.
5. Two existing config tests pin today's backfill of `maxToolTurns` alone and change meaning once two more keys are backfilled: `src/config.test.ts:94` `const raw = JSON.stringify({ maxToolTurns: 42 });` expects the bytes unchanged, and `src/config.test.ts:339` `toEqual({ maxToolTurns: 20 })` after the notifications section is stripped.
6. Every typed override of `getConfig()` in a test spreads the real config first, so adding fields to `Config` breaks no fixture: `src/notifications/native.test.ts:45` `vi.spyOn(config, 'getConfig').mockReturnValue({` followed by `...defaults`, and likewise `src/command/manager.test.ts:1080` and `src/controller.test.ts:1837`.
7. The one partial `getConfig` mock is an untyped `vi.mock` factory, so the type checker does not hold it to `Config` and it needs no change: `src/open/file-manager.test.ts:19` `getConfig: () => ({ syncPaths: ['synced/'], externalViewers: { video: 'QuickTime Player' } }),`.
8. There are exactly two full `Config` object literals, and both must gain the two fields for the project to typecheck: `src/config.ts:87` `const DEFAULT_CONFIG: Config = {` and the object returned at `src/config-decode.ts:108` `return {` inside `decodeConfig`.
9. Two tests compare a whole config and keep passing unchanged as long as both new fields appear in `DEFAULT_CONFIG` and `decodeConfig` with the same defaults: `src/remote/serve-root-settle.test.ts:89` `expect(JSON.parse(readFileSync(configPath, 'utf8'))).toEqual(expected);` and `src/remote/serve-root-settle.test.ts:131` `expect(getConfig()).toEqual(defaults);`.
10. `loadConfig` has two production callers, and both get the new backfill with no change of their own: `src/main.ts:73` `loadConfig(cwd);` and `src/remote/serve-root-settle.ts:77` `loadConfig(root);`.
11. An invalid-JSON file falls back to `DEFAULT_CONFIG` itself, so both new defaults apply to a corrupt file with no extra code: `src/config.ts:145` `config = { ...DEFAULT_CONFIG };`.

## Existing functionality

1. Positive-integer decoding with fallback, the model for `nonNegativeIntegerValue`: `src/config-decode.ts:23` `function positiveIntegerValue(value: unknown, fallback: number): number`.
2. Boolean decoding with fallback: `src/config-decode.ts:31` `function booleanValue(value: unknown, fallback: boolean): boolean`.
3. Backfilling one missing key into an existing config file, which `backfillMissingKeys` replaces: `src/config-decode.ts:100` `export function backfillMaxToolTurns`.
4. Finding several missing keys by `Object.hasOwn` and appending their defaults, the model for `backfillMissingKeys`: `src/config-decode.ts:89` `const missing = Object.keys(defaults.alerts).filter((event) => !Object.hasOwn(rawAlerts, event));`.
5. Raw record narrowing used by the backfill: `src/config-decode.ts:129` `export function configRecord(value: unknown)`.
6. A failed-backfill test that makes the config directory read-only, the model for the new failure test: `src/config.test.ts:128` `it('keeps the decoded config when the max tool turns backfill cannot be written'`.
7. The spec wording for a backfilled setting, the model for the two new rows: `product/specs/application-config.md:10` "A fresh config writes the key out, and a config that predates it gains the key the next time it is loaded."

## Implementation steps

1. **Config settings and backfill.** In `src/config.ts`, add `logEnabled: boolean` and `logRetentionInDays: number` to `Config` with the comments and placement set in Design decisions. Add the exported `DEFAULT_LOG_RETENTION_IN_DAYS = 7` after `DEFAULT_MAX_TOOL_TURNS`, and add `logEnabled: true` and `logRetentionInDays: DEFAULT_LOG_RETENTION_IN_DAYS` to `DEFAULT_CONFIG` after `recordShellTabs`. In `src/config-decode.ts`, add `nonNegativeIntegerValue` after `positiveIntegerValue`, with a one-line comment saying why `0` is valid here when it is not for `positiveIntegerValue`. In `decodeConfig`, after `recordShellTabs`, decode `logEnabled` with `booleanValue` and `logRetentionInDays` with `nonNegativeIntegerValue`. Replace `backfillMaxToolTurns` with `backfillMissingKeys` and its `BACKFILLED_KEYS` list as set in Design decisions, and delete `backfillMaxToolTurns`. Change the import at `src/config.ts:6` and the call at `src/config.ts:132` to `backfillMissingKeys`; the rest of `loadConfig` stays as it is. Both files stay well under the 200-line `max-lines` limit (about 127 and 110 counted lines today), so no extraction is needed. Update `src/config.test.ts` (see Tests). No other test file changes (Assumptions 6, 7, 9). Build command: `$janissary/scripts/run.mjs check-diff`.
2. **Spec.** In `product/specs/application-config.md`, add `logEnabled` and `logRetentionInDays` rows to the settings table directly after the `recordShellTabs` row, matching the order in `Config`. Each row states its type, its default, its decode fallback (a non-boolean `logEnabled` falls back to `true`; a negative, fractional, or non-number `logRetentionInDays` falls back to `7`, and `0` is valid), and, in the `maxToolTurns` row's words, that a fresh config writes the key out and a config that predates it gains the key the next time it is loaded (Existing functionality 7). In the loading paragraph, rewrite the backfill sentence ("the one exception is a missing `maxToolTurns` key") to name all three backfilled keys, and add after the count-style sentence ("Count-style settings such as `clipboardHistoryMaxEntries` and `maxToolTurns` also fall back") that `logRetentionInDays` takes `0` as a valid value but still falls back on a negative or a fraction. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. The settings are hand-edited in `.janissary/config.json`; no UI surface changes.

## Tests

All in `src/config.test.ts`, inside the existing `describe('loadConfig')` block, using its `tmpDir` setup and the same write-then-`loadConfig` pattern as its neighbors:

- A fresh config is written with `logEnabled: true` and `logRetentionInDays: DEFAULT_LOG_RETENTION_IN_DAYS`, and the loaded config carries both (Requirements 1, 2, 5).
- `logRetentionInDays` values `0`, `3`, `-1`, `1.5`, and `"7"` decode to `0`, `3`, `7`, `7`, and `7`, as one `it.each` in the style of "falls back to 20 for the invalid max tool turns %p while keeping valid neighbors" (Requirements 1, 3, 4).
- An explicit `logEnabled: false` decodes to `false` (Requirement 5).
- A non-boolean `logEnabled` (for example `"false"`) decodes to `true` (Requirement 6).
- An existing config holding `maxToolTurns`, `transcriptMaxLines: 100`, and `custom: 'kept'` but neither new key is rewritten with both added at their defaults, and `transcriptMaxLines` and `custom` are unchanged in the file (Requirements 7, 8).
- An existing config missing only `logRetentionInDays` gains just that key, and its `logEnabled` value is kept as written (Requirements 7, 8).
- A config holding all three keys with `logRetentionInDays: -1` is not rewritten (bytes unchanged), while the loaded config carries `7` (Requirements 4, 11).
- A backfill write that fails, set up as the existing "keeps the decoded config when the max tool turns backfill cannot be written" test does it (Existing functionality 6), leaves the loaded config with `logEnabled: true` and `logRetentionInDays: 7` and writes nothing to stderr. Add it as a new test and leave the existing one as it is (Requirements 9, 10).
- Change the fixture of "honors an explicit max tool turns and does not rewrite the file" to carry all three keys so it still proves a complete file is not rewritten (Requirement 11; Assumption 5).
- Change the expectation of "strips a legacy notifications section from an otherwise complete config.json" to `{ maxToolTurns: 20, logEnabled: true, logRetentionInDays: 7 }` (Assumption 5).

## Out of scope

- Reading either setting anywhere: the launch sweep (subplan 4) and the write gate (subplan 5) do that.
- Moving the harness transcript directory: subplan 3 does that.
- Shell-tab text transcripts, recordings, captures, and the daily activity log keep their current behavior; these settings do not govern them (user answer: "Harness transcripts only").
- No runtime command to change either setting; the user edits `.janissary/config.json`.
- Documentation follow-up feature candidate: the user documentation's configuration reference for both settings. User and developer documentation is owned by `update-documentation.md`, not by a feature PR or plan.

## Verification

1. `$janissary/scripts/run.mjs check-diff`
2. **Backfill.** From the checkout, run `npm run build`. Make a scratch directory, launch it once with `node bin/janus.mjs --no-open <scratch>` so it gets a config file, and stop it with `node bin/janus.mjs stop <scratch>`. Edit `<scratch>/.janissary/config.json`: remove `logEnabled` and `logRetentionInDays`, and add `"custom": "kept"`. Launch and stop it again the same way. The file now holds `"logEnabled": true` and `"logRetentionInDays": 7` after the existing keys, with every other key, `custom` included, unchanged. Launch and stop once more: the file's bytes do not change. A failure looks like a missing key, a lost `custom` key, or the file being rewritten on every launch.
3. **Invalid value kept.** Set `"logRetentionInDays": -1` in the same file, then launch and stop. The file still says `-1`; it is not replaced with `7`. A failure looks like the backfill overwriting the user's value.
4. **Fresh config.** Launch and stop an empty scratch directory the same way: the new `.janissary/config.json` holds `"logEnabled": true` and `"logRetentionInDays": 7`, right after `recordShellTabs`.
