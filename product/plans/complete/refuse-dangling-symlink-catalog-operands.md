# Refuse catalog operands hidden behind dangling symlinks

**Complexity: 4/10** — ~19 added lines in 1 production file, 9 requirements and 7 test scenarios (p=4.91)

## Goal

An `hosts export` or `hosts import` aimed at a dangling symlink whose link text resolves to a saved-hosts catalog currently passes the catalog guard, because the guard falls back to `path.resolve` on the link path when `realpathSync` fails. The writer then resolves the link and writes through to the file it names, so an export can create or replace a catalog with ssh-config text and make every saved host appear to vanish. Make the guard follow dangling links the same way the writer does, so both catalogs are refused before any read or write no matter how an operand spelling hides them.

## Requirements

1. "Close the security gap where a dangling symlink to a saved-hosts catalog bypasses the export guard." An export whose operand is a dangling symlink resolving to a catalog is refused before any read or write.
2. "when `realpathSync` fails with `ENOENT` on a symbolic link it reads the link with `readlinkSync`, resolves the text against `path.dirname(filePath)`, and repeats resolution with a bounded loop before comparing against `catalogPaths`" — the resolver follows link text, including link chains, instead of stopping at the link path.
3. "keep the plain `path.resolve` fallback for a missing non-link path" — a path that is merely absent still resolves to itself.
4. "Resolve both the operand and each catalog path through that helper so a link naming a not-yet-created catalog is refused too." The operand and both catalog locations use one resolution rule, so a link naming a catalog that does not exist yet is refused.
5. "a dangling link naming the project catalog refused for both export and import" — the same refusal applies to each verb.
6. "both catalogs byte-for-byte unchanged and no write" — a refused operation touches neither catalog and calls no write.
7. "a control dangling link to a non-catalog path that still executes" — an ordinary dangling config link still runs the export and writes through to the file it names.
8. "The live-symlink catalog case in `src/plugins/hosts/activate.test.ts` and the dangling-symlink write-through case in `src/plugins/hosts/ssh-config-file.test.ts` must keep passing" — existing symlink behavior is untouched.
9. "no prose edit is needed" — the existing spec statement and the pull request description already describe this behavior, so no spec or help prose changes.

## Design decisions

- Follow a dangling link inside `realPath` with a bounded loop rather than a single `readlinkSync` step. The writer resolves only one hop today, so the guard must handle at least that case and link chains without an unbounded walk (Requirements 2; Assumptions 1, 4).
- Detect a link by attempting `readlinkSync` in the `ENOENT` branch: it succeeds only for a symlink, and its failure leaves the existing `path.resolve` fallback intact for a missing non-link path (Requirements 2, 3; Assumptions 1).
- Keep the comparison in `isCatalogPath` calling the same helper for both the operand and every catalog path, so a link on either side resolves to a common real path before comparison (Requirement 4; Assumption 2).
- Leave the refusal in the shared runner so the command and intent entry points keep one guard owner, as the feature plan requires (Requirement 5; Assumption 5).
- Keep the change inside `ssh-intents.ts` (115 lines today). The bounded loop adds well under the 200-line `max-lines` budget, so no module extraction is needed (Assumption 6).
- Do not edit prose. `product/specs/hosts-tab.md` § Catalog files are not ssh configs already states that symlink spellings resolving to a catalog are refused, and no help page describes the guard (Requirement 9; Assumption 7).

## Preserved behavior

1. A live symlink that names a catalog is refused before any read or write, with both catalogs unchanged. It must not be treated as an ordinary config and written through. Pinned by `src/plugins/hosts/activate.test.ts` › `refuses an export that reaches the home catalog through a symlink`.
2. An export through a dangling symlink to an ordinary config path writes through to the file the link names and leaves the link text unchanged. It must not be refused as a catalog or replace the link with a regular file. Pinned by `src/plugins/hosts/ssh-config-file.test.ts` › `writes through a dangling symlink and creates the file it points at with mode 0600`.
3. A direct path naming a catalog is refused for both verbs. It must not fall through to an import read or an export write. Pinned by `src/plugins/hosts/activate.test.ts` › `refuses an export aimed at the home catalog without touching either catalog`.
4. A `..` spelling that resolves to a catalog is refused. It must not be normalized only on the writer side. Pinned by `src/plugins/hosts/activate.test.ts` › `refuses a dot-dot spelling that resolves to the home catalog`.

## Assumptions

1. `src/plugins/hosts/ssh-intents.ts:30` `function realPath(filePath: string): string {` is the resolver the guard already uses, and `src/plugins/hosts/ssh-intents.ts:1` `import { realpathSync } from 'node:fs';` is where `readlinkSync` joins it.
2. `src/plugins/hosts/ssh-intents.ts:38` `function isCatalogPath(targetPath: string, root: string, home: string): boolean {` already calls `realPath` on the operand and on each entry of `[project, catalogHome]`, so only the helper itself needs changing.
3. `src/plugins/hosts/hosts-file.ts:87` `export function catalogPaths(root: string, home: string)` supplies the project and home catalog locations from the origin root and `homedir()`.
4. `src/plugins/hosts/ssh-config-file.ts:41` `const resolved = path.resolve(path.dirname(target), readlinkSync(target));` is how the writer resolves a dangling link; the guard must mirror that resolution before the write happens.
5. `product/plans/complete/import-openssh-aliases-into-the-hosts-tab.md:89` "The guard has exactly one owner, in the runner." keeps the refusal in `runSshIntent`.
6. `src/plugins/hosts/ssh-intents.ts` is 115 lines and `eslint.config.mjs:62` sets `max-lines: 200` with blanks and comments skipped, so the added loop needs no extraction.
7. `product/specs/hosts-tab.md:145` `### Catalog files are not ssh configs` already says "A symlink or an alternate spelling that resolves to a catalog is refused just like the direct path.", and `help/` has no page for `hosts` import or export guards.

## Existing functionality

1. `src/plugins/hosts/ssh-intents.ts:30` `realPath` is the realpath-or-resolve helper to extend with link following.
2. `src/plugins/hosts/ssh-intents.ts:38` `isCatalogPath` is the guard that compares a resolved operand against both resolved catalog paths.
3. `src/plugins/hosts/ssh-intents.ts:45` `catalogRefusal` builds the existing per-verb refusal text, so no new message is needed.
4. `src/plugins/hosts/ssh-config-file.ts:30` `writeSshConfigFile` writes through dangling links and supplies the resolution the guard must anticipate.
5. `src/plugins/hosts/activate.test.ts:141` `refusal` is the helper that asserts `TabPluginRejection` messages in command tests.
6. `src/plugins/hosts/activate.test.ts:421` `refuses an export aimed at the home catalog without touching either catalog` is the fixture pattern for byte-for-byte catalog checks and a cleared `writeFileSync` mock.

## Implementation steps

1. In `src/plugins/hosts/ssh-intents.ts`, add `readlinkSync` to the `node:fs` import and extend `realPath` with a bounded loop: attempt `realpathSync(current)` and return it on success; on an error whose `code` is `ENOENT`, read the link text with `readlinkSync(current)` and set `current` to `path.resolve(path.dirname(current), link)`; when `readlinkSync` throws (a missing non-link path) or the hop bound is reached, return `path.resolve(current)`. Leave `isCatalogPath` calling `realPath` for the operand and for each catalog path. Build and check with `$janissary/scripts/run.mjs check-diff`.

## UI design

1. None. The change alters which operands a command or intent refuses before doing work. It adds no control, layout, state, key binding, or notification, and the Hosts tab's Import and Export buttons look and behave exactly as before apart from the refusal of a previously accepted path.

## Tests

- `src/plugins/hosts/activate.test.ts`: add a case that seeds both catalogs, creates a dangling link under the home directory whose link text resolves to the project catalog, runs `hosts export <link>`, and asserts the catalog refusal, both catalogs byte-for-byte unchanged, no `writeFileSync` call, and no tab update or open (Requirements 1, 2, 4, 5, 6). Mirror the byte-for-byte and cleared-mock setup of the existing catalog-refusal cases (Existing functionality 6).
- `src/plugins/hosts/activate.test.ts`: mirror that case for `hosts import <link>`, asserting the import-source refusal with the same unchanged-catalog and no-write checks (Requirements 4, 5, 6).
- `src/plugins/hosts/activate.test.ts`: add a control case with a dangling link to a non-catalog config path, run the export, and assert the normal "Exported 1 host" note and that the file the link names received the managed section (Requirement 7; Preserved behavior 2).
- The live-symlink catalog refusal, the direct-catalog refusals, the dot-dot refusal, and the dangling-symlink write-through case stay untouched and keep passing (Requirement 8; Preserved behavior 1, 3, 4).

## Out of scope

- Changing `src/plugins/hosts/ssh-config-file.ts` or any write-through, file-mode, or problem-word behavior.
- Changing refusal text, display abbreviations, operand expansion, or command parsing.
- Editing spec or help prose. `product/specs/hosts-tab.md` § Catalog files are not ssh configs already states the behavior, and no `help/` page describes it (Requirement 9).
- Editing user or developer documentation; that is owned by `update-documentation.md`.
- Adding a work item to either backlog or correcting the pull request description.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then check against the running app:

1. In a scratch project with a saved host, seed both catalogs, create a dangling link under the home directory whose text is `<root>/.janissary/absent/../hosts.json`, then run `hosts export ~/dangling.json` from the app.
2. Expect `Cannot export hosts: ~/dangling.json is the hosts catalog and cannot be an export target.`, both catalogs unchanged byte for byte, and the link still dangling. `hosts import ~/dangling.json` must give the import-source counterpart.
3. Failure looks like an `Exported 1 host` note, a changed catalog, or a file created at the link target.
4. Repeat with a dangling link to an ordinary config path and confirm the export succeeds and writes the managed section to the file the link names.
