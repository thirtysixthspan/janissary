# Guard ssh-config Host-pattern matching against unbounded glob complexity
**Complexity: 3/10** — ~20 added lines in one edited file, 9 requirements and 4 test scenarios, one new module (p=4.78)

## Goal

Bound the work done while matching OpenSSH `Host` patterns during alias import. The ssh-config alias reader compiles a `Minimatch` for every name in every `Host` block and recompiles them for every alias, with no complexity cap, while file globs are already refused before compilation. Bring the same kind of guard to Host patterns so a config full of long or star-heavy patterns cannot stall the main thread, keeping ordinary `*` and `?` matching intact and turning a refused pattern into a non-matching block rather than an error.

## Requirements

1. Each `Host` pattern longer than 1024 characters is refused before a `Minimatch` is built for it ("caps pattern length ... mirroring the rationale in src/file-glob/pattern-limits.ts").
2. Each `Host` pattern with more than three `*` runs in one name is refused before a `Minimatch` is built for it ("the number of * runs in one name").
3. `?` stays linear and is not capped, and a `**` run counts as a single `*` run ("`?` and `**` stay linear").
4. A refused pattern makes its whole `Host` block non-matching rather than throwing out of `readEffectiveAliases` ("have a refused pattern make its block non-matching rather than throw out of readEffectiveAliases").
5. A negated refused pattern also makes its block non-matching, so refusing it cannot let the block apply by fail-open exclusion ("so the guard neither fails open nor rejects normal configs").
6. A pattern within both limits is compiled with the `nocase`, `dot`, `nobrace`, `noext`, and `nonegate` options unchanged, and a leading `!` is still stripped by hand before compilation ("keep the nocase, dot, nobrace, noext, nonegate options and the manual leading-! stripping unchanged").
7. Ordinary `*` and `?` Host patterns keep matching the same aliases as before ("ordinary * and ? host patterns keep matching as today").
8. The guard lives in a sibling module in the ssh-config namespace and imports nothing through `../` ("a sibling helper in src/plugins/hosts/ssh-config/ since these modules cannot import through ../").
9. `tokenizeSshConfig` and its block-list cases stay unchanged ("Do not change tokenizeSshConfig or its block-list cases, which pin the preserved tokenizer behavior").

## Design decisions

- The guard is a new sibling module `src/plugins/hosts/ssh-config/pattern-limits.ts`, imported by `parse.ts` as `./pattern-limits.js`. A module under `src/plugins/hosts/ssh-config/` cannot reach the file-glob module through `../`, so the limits are restated locally rather than shared (Requirements 1, 2 and 8). Keeping the guard out of `parse.ts` also leaves that file well under the 200-line `max-lines` cap.
- Mirror the file-glob numbers — 1024 characters and three `*` runs in one name — and its `starRuns` counting, where one run of consecutive `*` counts once and `**` counts as one run. Do not import its brace or parent-segment logic: host patterns are not paths, and `nobrace: true` already disables brace expansion (Requirements 1 to 3 and 6).
- Apply the guard to the string that is actually compiled: strip the leading `!` first, then judge and compile the remaining pattern. The cap and `Minimatch` therefore see the same characters (Requirement 6).
- Represent a refused pattern in `compilePatterns` by an absent matcher rather than throwing. `blockMatches` returns false as soon as it meets one, whether the name was negated or not; that makes the entire block non-matching and keeps `readEffectiveAliases` unable to throw on a pathological name (Requirements 4 and 5).
- Keep the `Minimatch` option set and the manual leading-`!` stripping exactly as they are, so every pattern that was within limits behaves identically (Requirements 6 and 7).
- Give the new module one comment recording the rationale — synchronous matching with cost growing as name length raised to the star count, with `?` and `**` linear — mirroring `src/file-glob/pattern-limits.ts`. No other new comments are added.

## Preserved behavior

1. Ordinary `*` and `?` Host patterns still apply their settings to matching aliases, including the first-value-wins order across blocks; they must not be refused or made non-matching. Pinned by `src/plugins/hosts/ssh-config/parse.test.ts` › `readEffectiveAliases > applies matching blocks in file order with first values winning` (`Host *`, `Host w?b1`, `Host db*`).
2. A leading `!` is still stripped before matching and a negated pattern still excludes an alias from its block; the guard must not turn that stripping into an exception or change the negation result for in-limit patterns. Pinned by `src/plugins/hosts/ssh-config/parse.test.ts` › `readEffectiveAliases > applies matching blocks in file order with first values winning` (`Host web1 !web1`, `Host !web1`).
3. `tokenizeSshConfig` still returns the same ordered block list, including repeated names, and its block cases stay byte for byte unchanged. Pinned by `src/plugins/hosts/ssh-config/parse.test.ts` › `tokenizeSshConfig > produces one Host block carrying every name in file order, repeats included`.

## Assumptions

1. `minimatch` is a production dependency: `package.json:114` `"minimatch": "^11.0.8",`.
2. The file-glob caps are 1024 characters and three `*` runs: `src/file-glob/pattern-limits.ts:3` `export const FILE_GLOB_MAX_PATTERN_LENGTH = 1024;` and `:5` `export const FILE_GLOB_MAX_NAME_STARS = 3;`.
3. Star runs are counted by consecutive `*` with `**` as one run: `src/file-glob/pattern-limits.ts:23` `function starRuns(name: string): number {`.
4. The house guard refuses a complex pattern before constructing `Minimatch`: `src/file-glob/match.ts:16` `if (isGlobPatternTooComplex(normalized)) return matchNothing;`.
5. Host patterns are compiled with a fixed option set after manual negation stripping: `src/plugins/hosts/ssh-config/parse.ts:94` `const negated = name.startsWith('!');` and `:97` `matcher: new Minimatch(pattern, {`.
6. Every compiled block is matched through one call site: `src/plugins/hosts/ssh-config/parse.ts:145` `if (block.kind !== 'host' || !blockMatches(compilePatterns(block.names), alias.name)) continue;`.
7. Modules under `ssh-config/` must not import through `../`: `src/plugins/hosts/ssh-config/parse.test.ts:226` `expect(specifier).not.toContain('../');`.
8. Vitest colocated tests are the house convention: `src/plugins/hosts/ssh-config/parse.test.ts:1` `import { describe, expect, it } from 'vitest';`.

## Existing functionality

1. The star-run counting rule to mirror: `src/file-glob/pattern-limits.ts:23` `function starRuns(name: string): number {`.
2. The refuse-before-compile call-site pattern: `src/file-glob/match.ts:16` `if (isGlobPatternTooComplex(normalized)) return matchNothing;`.
3. The `Minimatch` construction with a fixed options object: `src/plugins/hosts/ssh-config/parse.ts:97` `matcher: new Minimatch(pattern, {`.
4. The colocated Vitest suite that already pins alias matching and the tokenizer: `src/plugins/hosts/ssh-config/parse.test.ts:140` `describe('readEffectiveAliases', () => {`.

## Implementation steps

Every step ends green under `$janissary/scripts/run.mjs check-diff`, which is each step's build command.

1. Create `src/plugins/hosts/ssh-config/pattern-limits.ts` exporting the two cap constants and one predicate that returns true when a pattern exceeds the length cap or has more than three `*` runs. Count runs of consecutive `*` with one match over `/\*+/g`, so `**` counts once, and add the single rationale comment described under Design decisions. Import nothing through `../`. Build with `$janissary/scripts/run.mjs check-diff`.
2. In `src/plugins/hosts/ssh-config/parse.ts`, add the `./pattern-limits.js` import, change `Pattern` so its matcher may be absent, have `compilePatterns` leave the matcher absent for a refused pattern after the leading `!` is stripped, and have `blockMatches` return false immediately when it meets such a pattern. Leave the option set, the manual negation stripping, `assignValues`, `readEffectiveAliases`, and `tokenizeSshConfig` untouched. Build with `$janissary/scripts/run.mjs check-diff`.

## UI design

1. No user interface surface changes. The guard is internal to a pure parsing module: no command, flag, key binding, dialog, or client component is added or changed.

## Tests

Add to `src/plugins/hosts/ssh-config/parse.test.ts`, one case per group, each tied to its requirement:

- An over-long name (more than 1024 characters) in a `Host` line supplies no settings to an alias and does not throw; a sibling normal alias is still returned (Requirements 1 and 4).
- A star-heavy name with more than three `*` runs but under the length cap supplies no settings and does not throw (Requirements 2 and 4).
- A negated over-long or star-heavy name leaves its block non-matching, so it does not suppress settings from a valid block (Requirement 5).
- An ordinary `*` pattern and an ordinary `?` pattern still supply their settings to the matching alias (Requirement 7 and Preserved behavior 1).

Leave every `tokenizeSshConfig` case byte for byte unchanged (Requirement 9 and Preserved behavior 3), and keep imports inside `./` or package specifiers with `.js` extensions (Requirement 8).

## Out of scope

- No brace-expansion or parent-segment caps from the file-glob module; host names are not paths and braces are already disabled.
- No change to `tokenizeSshConfig`, its block types, or its existing cases.
- No escaping of brackets or backslashes in literal names; that is a separate finding.
- No change to import, export, command verbs, intents, buttons, help pages, or the user/developer documentation trees.
- No new spec beyond the one functional spec that records this behavior.

## Verification

Run `$janissary/scripts/run.mjs check-diff`; lint, typecheck, and both test projects must pass.

Then run `npx vitest run --project server src/plugins/hosts/ssh-config/parse.test.ts` and read the new cases. Confirm an over-long name and a name with four `*` runs each leave the alias with empty settings, that a negated refused name does not suppress a valid block, and that `Host *` and `Host w?b1` still supply their settings. A failure looks like a thrown error, a refused pattern applying its HostName, a negated refused pattern blanking a valid alias, or an ordinary wildcard losing its match.

The import command is not on this branch yet, so there is no UI path to drive. As the reader-performable end-to-end check, read `src/plugins/hosts/ssh-config/parse.ts` and `src/plugins/hosts/ssh-config/pattern-limits.ts` together: confirm the guard is judged on the post-`!` pattern string, that no `Minimatch` is built for a refused name, that a refused name makes the whole block non-matching, and that the option set and tokenizer are unchanged. A `../` import, a constructed matcher for a refused name, or a changed tokenizer means the change was not made correctly.
