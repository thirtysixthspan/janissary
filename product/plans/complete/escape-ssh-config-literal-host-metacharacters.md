# Match literal ssh-config Host names containing minimatch metacharacters
**Complexity: 3/10** — ~5 added lines in one edited file, 9 requirements and 4 test scenarios, one helper function (p=4.50)

## Goal

When an OpenSSH `Host` line names an alias literally, that alias must receive the settings from its own block. A name such as `[::1]` or one carrying a backslash is a literal alias, but the same characters are syntax to the glob matcher, so the alias currently never matches its own block and its `HostName`, `User`, and `Port` are silently lost. Escape only the characters minimatch treats as syntax while leaving `*` and `?` as wildcards, so literal aliases resolve to their configured values without changing any other matching behavior.

## Requirements

1. A literal `Host` name containing brackets matches its own block and supplies that block's `HostName` ("a bracketed IPv6-style alias whose HostName comes from its own block").
2. A literal `Host` name containing a backslash matches its own block and supplies its settings ("a backslash-bearing name").
3. Bracket and backslash characters are escaped in each pattern before `Minimatch` is constructed ("escape the bracket and backslash characters in each pattern before constructing Minimatch in compilePatterns").
4. `*` keeps its wildcard meaning after the escape ("an ordinary * pattern that must still match").
5. `?` keeps its wildcard meaning after the escape ("while * and ? keep their wildcard meaning").
6. A leading `!` is still stripped before the pattern is escaped and compiled ("keep the leading-! stripping ... unchanged").
7. The `nocase`, `dot`, `nobrace`, `noext`, and `nonegate` options passed to `Minimatch` are unchanged ("keep ... the nocase, dot, nobrace, noext, nonegate options unchanged").
8. The sibling pattern-complexity guard still refuses an over-long or star-heavy pattern before compilation and leaves its block non-matching ("Note a prior repair added a sibling pattern-complexity guard in this namespace; preserve it and its tests").
9. `tokenizeSshConfig` and its block-list cases are byte for byte unchanged ("Leave tokenizeSshConfig and its block-list cases untouched").

## Design decisions

- Escape inside `compilePatterns`, on the single `pattern` string that is passed to `Minimatch`, by rewriting each `\`, `[`, and `]` to its backslash-escaped form. `Minimatch` reads those three characters as an escape and a bracket class under the fixed options, while `*`, `?`, `{`, `}`, `(`, `)`, `+`, `@`, `|`, and an interior `!` already behave literally or as the intended wildcards; escaping only the three that need it keeps the change narrow (Requirements 3 to 5 and 7).
- Apply the escape after the `!` is stripped and after `isHostPatternTooComplex` has judged the pattern. The guard therefore still sees the original post-`!` string and keeps its exact length and star-run behavior, and only the matcher receives the escaped spelling (Requirements 6 and 8).
- Keep the escape in `parse.ts` as a small local helper rather than a new module. The file has 179 non-blank, non-comment lines, so a helper plus one call site stays under the 200-line `max-lines` cap, and no new import is introduced (Requirement 3).
- Leave the `Pattern` shape, `blockMatches`, `assignValues`, `readEffectiveAliases`, `tokenizeSshConfig`, and `pattern-limits.ts` untouched. The escaped pattern flows through the existing matcher unchanged, so a refused pattern still produces an absent matcher and a non-matching block (Requirements 8 and 9).
- Add no comments: the helper name states the intent and the task calls for clean code without new commentary.

## Preserved behavior

1. An over-long or star-heavy `Host` pattern is still refused before a `Minimatch` is built, contributes no settings, and cannot throw out of `readEffectiveAliases`; it must not become acceptable because escaping lengthens its string. Pinned by `src/plugins/hosts/ssh-config/parse.test.ts` › `readEffectiveAliases > refuses an over-long Host pattern without applying its settings` and the sibling star-heavy and negated-refusal cases.
2. A leading `!` is still stripped by hand and a negated name still excludes an alias from its block, including when the name contains a bracket; the escape must not change negation. Pinned by `src/plugins/hosts/ssh-config/parse.test.ts` › `readEffectiveAliases > applies matching blocks in file order with first values winning` (`Host web1 !web1`, `Host !web1`).
3. Ordinary `*` and `?` `Host` patterns still supply their settings through the same fixed option set and first-value-wins order. Pinned by `src/plugins/hosts/ssh-config/parse.test.ts` › `readEffectiveAliases > keeps ordinary * and ? Host patterns matching`.
4. `tokenizeSshConfig` still returns the same ordered block list, including repeated names and the trailing-backslash case, unchanged byte for byte. Pinned by `src/plugins/hosts/ssh-config/parse.test.ts` › `tokenizeSshConfig > produces one Host block carrying every name in file order, repeats included`.

## Assumptions

1. `minimatch` is a production dependency and `Minimatch` is already imported: `src/plugins/hosts/ssh-config/parse.ts:1` `import { Minimatch } from 'minimatch';`.
2. A literal alias is recognized without regard to brackets or backslashes: `src/plugins/hosts/ssh-config/parse.ts:86` `function isLiteralName(name: string): boolean {` with `:87` `!name.includes('*') && !name.includes('?') && !name.startsWith('!')`.
3. One pattern string per name feeds both the guard and the matcher: `src/plugins/hosts/ssh-config/parse.ts:96` `const pattern = negated ? name.slice(1) : name;`.
4. The guard runs before construction: `src/plugins/hosts/ssh-config/parse.ts:97` `if (isHostPatternTooComplex(pattern)) {`.
5. The matcher is built from a fixed option set: `src/plugins/hosts/ssh-config/parse.ts:102` `matcher: new Minimatch(pattern, {` with `:103` to `:108` listing `nocase`, `dot`, `nobrace`, `noext`, and `nonegate`.
6. `Minimatch.match` is the only consumer of the compiled pattern: `src/plugins/hosts/ssh-config/parse.ts:120` `if (!pattern.matcher.match(alias)) continue;`.
7. The sibling guard exists in its own module and is imported with a `.js` extension: `src/plugins/hosts/ssh-config/parse.ts:2` `import { isHostPatternTooComplex } from './pattern-limits.js';`.
8. Modules under `ssh-config/` must not import through `../` and use colocated Vitest tests: `src/plugins/hosts/ssh-config/parse.test.ts:268` `expect(specifier).not.toContain('../');` and `:1` `import { describe, expect, it } from 'vitest';`.

## Existing functionality

1. The single compile site in `compilePatterns`: `src/plugins/hosts/ssh-config/parse.ts:92` `function compilePatterns(names: string[]): Pattern[] {`.
2. The manual negation stripping: `src/plugins/hosts/ssh-config/parse.ts:95` `const negated = name.startsWith('!');`.
3. The refuse-before-compile guard: `src/plugins/hosts/ssh-config/parse.ts:97` `if (isHostPatternTooComplex(pattern)) {`.
4. The fixed matcher options: `src/plugins/hosts/ssh-config/parse.ts:102` `matcher: new Minimatch(pattern, {`.
5. The colocated suite that already pins matching, the guard, and the tokenizer: `src/plugins/hosts/ssh-config/parse.test.ts:140` `describe('readEffectiveAliases', () => {`.

## Implementation steps

Every step ends green under `$janissary/scripts/run.mjs check-diff`, which is each step's build command.

1. In `src/plugins/hosts/ssh-config/parse.ts`, add a small local helper immediately above `compilePatterns` that takes a pattern string and returns it with every `\`, `[`, and `]` replaced by its backslash-escaped form, leaving `*` and `?` untouched. Import nothing and add no comments. Build with `$janissary/scripts/run.mjs check-diff`.
2. In `compilePatterns`, pass the escaped form of `pattern` to `new Minimatch(...)` while leaving the leading-`!` stripping, the `isHostPatternTooComplex(pattern)` check on the unescaped post-`!` string, the option object, `Pattern`, `blockMatches`, `assignValues`, `readEffectiveAliases`, `tokenizeSshConfig`, and `pattern-limits.ts` untouched. Build with `$janissary/scripts/run.mjs check-diff`.

## UI design

1. No user interface surface changes. The fix is internal to a pure parsing module: no command, flag, key binding, dialog, or client component is added or changed.

## Tests

Add to the `readEffectiveAliases` describe block in `src/plugins/hosts/ssh-config/parse.test.ts`, mirroring its array-of-lines and `toEqual` style, one case per group and each tied to a requirement:

- A bracketed IPv6-style name on its own `Host` line with `HostName`, `User`, and `Port` resolves to those configured values, proving its literal spelling matches its own block (Requirements 1 and 3).
- A name carrying a backslash on its own `Host` line resolves to its configured `HostName` (Requirement 2).
- An ordinary `*` pattern and an ordinary `?` pattern still supply their settings to a matching alias alongside an escaped bracketed name (Requirements 4 and 5, and Preserved behavior 3).
- A negated bracketed name still excludes its alias from that block while the positive bracketed block supplies its `HostName` (Requirement 6).

Leave every `tokenizeSshConfig` case byte for byte unchanged (Requirement 9 and Preserved behavior 4), and keep the existing over-long, star-heavy, and negated-refusal cases passing untouched (Requirement 8 and Preserved behavior 1). Keep imports inside `./` or package specifiers with `.js` extensions (Assumption 8).

## Out of scope

- No change to `tokenizeSshConfig`, its block types, or its existing cases.
- No change to the sibling complexity guard, its constants, its module comment, or its tests.
- No change to the `Minimatch` option set or the manual leading-`!` stripping.
- No escaping of `*`, `?`, braces, parentheses, `+`, `@`, `|`, or interior `!`; they already have the intended meaning under the fixed options.
- No literal-only `*`/`?` matcher replacing `Minimatch`; the existing matcher is kept behind the same call.
- No change to import, export, command verbs, intents, buttons, help pages, or the user/developer documentation trees.
- No new spec beyond the one functional spec that records this behavior.

## Verification

Run `$janissary/scripts/run.mjs check-diff`; lint, typecheck, and both test projects must pass, including the sibling guard cases.

Then run `npx vitest run --project server src/plugins/hosts/ssh-config/parse.test.ts` and read the new cases. Confirm a `[::1]` alias takes its own `HostName`, `User`, and `Port`, a backslash-bearing alias takes its `HostName`, `Host *` and `Host w?b1` still apply, and `Host ![::1]` still excludes. A failure looks like an empty value on a literal alias, an ordinary wildcard losing its match, or negation changing meaning.

As the reader-performable end-to-end check, read `src/plugins/hosts/ssh-config/parse.ts` alongside `src/plugins/hosts/ssh-config/parse.test.ts`: confirm the escape happens only on the string handed to `new Minimatch(...)`, that `isHostPatternTooComplex` still judges the unescaped post-`!` pattern, that the option object and `tokenizeSshConfig` are unchanged, and that `pattern-limits.ts` and its cases are untouched. An escaped pattern reaching the guard, a changed option, or an edited tokenizer means the change was not made correctly.
