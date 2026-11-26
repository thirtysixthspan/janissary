# Compute effective aliases from tokenized ssh config
**Complexity: 6/10** — ~110 added lines, 10 requirements and 21 test scenarios in one edited file (p=5.77)

## Goal

Extend the ssh-config module with the alias reader: literal alias names, effective values across matching `Host` blocks, and `%` expansion. It is the second piece of `import-openssh-aliases-into-the-hosts-tab.md`. Subplan 3 uses its alias list, and subplans 7 and 8 use its records when importing and exporting.

## Requirements

1. Each name on a `Host` line with no `*` or `?` and no leading `!` is a literal alias; a name with either wildcard, a `!`-prefixed name, and every name from a `Match` block are never aliases ("Literal names only").
2. Every `Host` block whose patterns match a literal alias applies to that alias, in file order ("Effective, like ssh").
3. A leading `!` negates a pattern and is stripped before matching, and `*` and `?` act as wildcards matched with `Minimatch` configured with `nocase`, `dot`, `nobrace`, `noext`, and `nonegate` ("Effective, like ssh", Implementation step 1).
4. For each of `HostName`, `User`, and `Port`, the first value obtained wins ("Effective, like ssh").
5. A setting inside a `Match` block never contributes, and everything from a `Match` line up to the next `Host` line is skipped ("Ignore Match blocks").
6. In an effective `HostName`, `%h` expands to the alias name and `%%` expands to a literal `%` ("Expand %h and %%").
7. Any `%` token in an effective `User` or `Port`, including `%h` and `%%`, and any `%` token other than `%h` or `%%` in an effective `HostName` marks the alias invalid ("Expand %h and %%").
8. Aliases are folded by name ignoring case, keeping the spelling of the first appearance ("One row, first spelling").
9. Each alias record holds the first-spelling `name` and raw `hostName`, `user`, and `port` strings, empty for a setting no block supplied, plus an `invalidToken` string that is empty for a valid alias and holds the raw offending token including its `%` when invalid; converting a record into a saved host belongs to the parent hosts module ("Expand %h and %%", source plan Design decisions).
10. The module imports nothing through `../` (Assumption 5 of the source plan).

## Design decisions

Depends on `import-openssh-aliases-into-the-hosts-tab-1-ssh-config-tokenizer.md`, which lands first and creates both `parse.ts` and `parse.test.ts`; this subplan cannot compile until that one has landed. `import-openssh-aliases-into-the-hosts-tab-3-managed-section-splice.md`, `import-openssh-aliases-into-the-hosts-tab-7-import-operation.md`, and `import-openssh-aliases-into-the-hosts-tab-8-export-operation.md` consume the alias records, so they land later.

- The reader is added to `src/plugins/hosts/ssh-config/parse.ts`, the same module the tokenizer lives in. Its only new import is the installed `minimatch` package; no `../` path is introduced (Assumption 3).
- Pattern matching uses `Minimatch` with `nocase`, `dot`, `nobrace`, `noext`, and `nonegate` as settled in `import-openssh-aliases-into-the-hosts-tab.md` Implementation step 1. `src/file-glob/match.ts:19` `compiled = new Minimatch(normalized, {` is the house example of constructing a `Minimatch` with an options object, but its values are path-globbing rules (`nocase: false`, `dot: hidden`, plus `nocomment`, `windowsPathsNoEscape`, `optimizationLevel`, `platform`); copy the constructor form, not those values. Strip each leading `!` before matching and keep negation out of the pattern passed to `Minimatch`: a block applies when at least one non-negated pattern matches and no negated pattern matches, and a block made only of negated patterns applies to no alias. This is a deliberate shortcut: minimatch still treats `[…]` and backslash as syntax where ssh treats them literally; swapping in a literal-only `*` / `?` matcher behind the same call is the escape hatch if one ever matters.
- Effective values are computed by walking blocks in file order and taking the first `HostName`, `User`, or `Port` whose patterns match the alias. Marked `Match` blocks are skipped wholesale, which also covers a `Match` line through the next `Host` line.
- Export one reader from `parse.ts` that takes the config text, calls `tokenizeSshConfig` internally, and returns the records; callers do not tokenize first. Keep `tokenizeSshConfig` and its block types (`SshConfigBlock`, `HostBlock`, `MatchBlock`, `SshSetting`) exported exactly as subplan 1 defines them, because subplan 3 imports the tokenizer from `./parse.js`. A `Host` block with an empty `names` array yields no alias. Identity is the lowercased name, while `name` keeps the first spelling in first-appearance order. Values stay raw strings, empty when no block supplied a value, and `invalidToken` holds the raw offending token including its `%` when invalid. An invalid alias still yields a record, since subplans 3 and 8 need its name for the clash check; only subplan 7 skips it. Converting a record into a `SavedHost` belongs to subplan 7, which lives in the parent hosts directory and can reach `hosts-values.ts`; a `ssh-config/` module cannot.
- Keep the reader in `parse.ts` so subplan 7's `ssh-config/parse.ts` call site still resolves. `parse.ts` is subject to the 200-line `max-lines` cap in `eslint.config.mjs`; if the tokenizer plus reader measures above 180 code lines, move only the reader's private helpers into a sibling `src/plugins/hosts/ssh-config/alias-values.ts` imported through `./alias-values.js`, leaving the reader's export and every consumer path unchanged.
- No file is read and no catalog is touched; the reader consumes text the caller supplies.

## Preserved behavior

1. `tokenizeSshConfig` keeps returning the same ordered block list for the tokenizer's inputs. Adding the alias reader must not change block order, `names`, `criteria`, `settings`, or the `kind` marker, and must not alter the tokenizer cases in `parse.test.ts`. Pinned by `src/plugins/hosts/ssh-config/parse.test.ts` › the tokenizer block-list cases delivered by `import-openssh-aliases-into-the-hosts-tab-1-ssh-config-tokenizer.md`.

## Assumptions

1. `minimatch` is an installed dependency: `package.json:114` `"minimatch": "^11.0.8"`.
2. The project's glob matcher is the `Minimatch` class: `src/file-glob/match.ts:1` `import { Minimatch } from 'minimatch';`.
3. A concrete server plugin cannot import host internals through `../`: `eslint.plugin-boundaries.mjs:36` `regex: String.raw` allowlists only the documented modules, and `src/plugins/hosts/ssh-config/` sits two levels under `src/plugins/`.
4. The effective-value and negation rules are settled in the source plan: `import-openssh-aliases-into-the-hosts-tab.md:17` `"every \`Host\` block whose patterns match the alias applies in file order"` and `:18` `"the first value obtained wins"`.
5. The `Minimatch` options and the `[…]`/backslash shortcut are settled in the source plan: `import-openssh-aliases-into-the-hosts-tab.md:140` `` with `nocase`, `dot`, `nobrace`, `noext`, and `nonegate` `` and `"This is a deliberate shortcut"`.
6. The tokenizer contract is delivered by subplan 1: `import-openssh-aliases-into-the-hosts-tab-1-ssh-config-tokenizer.md:26` `` Export one function, `tokenizeSshConfig`, from `parse.ts` ``, with block types `SshConfigBlock`, `HostBlock`, `MatchBlock`, and `SshSetting`.
7. Vitest colocated tests are the house convention for `src/`: `src/plugins/hosts/hosts-values.test.ts:1` `import { describe, expect, it } from 'vitest';` sits beside `src/plugins/hosts/hosts-values.ts`.

## Existing functionality

1. The `Minimatch` class plus an options object, the construction to mirror: `src/file-glob/match.ts:19` `compiled = new Minimatch(normalized, {`.
2. The ordered `Host` and `Match` block stream, with `tokenizeSshConfig` and its block types, delivered by subplan 1: `import-openssh-aliases-into-the-hosts-tab-1-ssh-config-tokenizer.md:26` `` Export one function, `tokenizeSshConfig`, from `parse.ts` ``.
3. Vitest colocated tests are the house convention for `src/`: `src/plugins/hosts/hosts-values.test.ts:1` `import { describe, expect, it } from 'vitest';`.

## Implementation steps

Every step ends green under `$janissary/scripts/run.mjs check-diff`. This subplan extends two files created by `import-openssh-aliases-into-the-hosts-tab-1-ssh-config-tokenizer.md`, which lands first; at that point both exist and nothing later closes a reference. Do not start here before subplan 1 has landed.

1. Extend `src/plugins/hosts/ssh-config/parse.ts` with the alias reader described under Design decisions, alongside the unchanged `tokenizeSshConfig` export. Export one reader that takes config text, tokenizes it with `tokenizeSshConfig`, and returns the records; implement Requirements 1 to 10 with `Minimatch`. Keep the reader pure, with no file I/O or `../` import, and do not add an `index.ts`. Build with `$janissary/scripts/run.mjs check-diff`; it is both the build command and the check that proves the step green.
2. Extend `src/plugins/hosts/ssh-config/parse.test.ts` with the cases listed under Tests beside the tokenizer cases, leaving the tokenizer cases byte for byte unchanged (Preserved behavior 1). Import from `./parse.js`, the `.js` extension required by `eslint.config.mjs:135` `js: 'always'`. Build with `$janissary/scripts/run.mjs check-diff`; it is both the build command and the check that proves the step green, and confirm both the new cases and the existing server tests pass.

## UI design

1. No user interface surface changes. The reader is a pure module with no command, intent, or client entry point.

## Tests

Add to `src/plugins/hosts/ssh-config/parse.test.ts`, one case per group, each tied to its requirement:

- A multi-name `Host` line yields one record per literal name; a pattern name, a `!`-prefixed name, and a name from a `Match` block yield none (Requirement 1).
- A `Host *`, a `?` pattern, and a negated block combine in file order, and the first value for each of the three settings wins even when a later block would set it (Requirements 2 to 4). A negated match excludes the alias from that block, a block of only negated patterns yields no record, and a `Host` line with no names yields no record (Design decisions).
- Settings in a `Match` block, including one between `Match` and the next `Host`, never appear in a record (Requirement 5).
- `%h` and `%%` expand in `HostName`; a `%n`, a trailing `%`, a `%h` or `%%` in `User` or `Port`, and any other `%` token mark the record invalid with its text in `invalidToken` (Requirements 6, 7 and 9).
- Two spellings differing only by case fold into one record under the first spelling, a setting no block supplied stays empty, and an invalid record carries its marker rather than a converted host (Requirements 8 and 9).
- The test file's own imports stay inside `./` and package specifiers, using `./parse.js` (Requirement 10 and `eslint.config.mjs:135` `js: 'always'`).

## Out of scope

- No `Include` following, no `Match` evaluation, and no system config file.
- No conversion into saved hosts, no validation with `validateHostFields`, and no other ssh setting (`IdentityFile`, `ProxyJump`, and the rest).
- No section splicing, file access, import or export operation, command, intent, or button.

## Verification

Run `$janissary/scripts/run.mjs check-diff`; lint, typecheck, and both test projects must pass with only these two files changed.

Then run `npx vitest run --project server src/plugins/hosts/ssh-config/parse.test.ts` and read the first-match case. Confirm a config with `Host web1 web2`, `HostName %h.corp.example`, `Host db*`, `User dba`, and a final `Host *` with `User ops` yields `web1.corp.example` with user `ops`, no `db*` record, and no `Match`-sourced value. A failure looks like a later value winning, a pattern row, or an invalid alias left valid.

Then read `src/plugins/hosts/ssh-config/parse.ts` as a third check: its only new import is `minimatch`, no `../` path appears, and `tokenizeSshConfig` and its block types are unchanged from subplan 1. A `../` import or a changed tokenizer block list means the change was not made correctly.
