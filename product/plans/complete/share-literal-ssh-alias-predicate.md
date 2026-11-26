# Share the literal SSH alias predicate between section.ts and parse.ts
**Complexity: 3/10** — 3 rewritten production lines across 2 files, 7 requirements and 6 scenarios (p=4.54)

## Goal

The ssh-config alias reader and the managed-section outside-alias detector currently hold two copies of the same literal-name rule, so an extension to one could silently change what the other reports. Make the reader's predicate the single definition and have the managed-section detector call it, so the two paths cannot drift while every name still counts the same way as before.

## Requirements

1. The existing predicate is exported so another module can call the one definition ("Export the existing `isLiteralName` predicate from `src/plugins/hosts/ssh-config/parse.ts`").
2. The managed-section module imports that predicate with a relative `.js` specifier ("import it from `./parse.js` in `src/plugins/hosts/ssh-config/section.ts`").
3. The outside-alias detector uses the shared predicate for its exclusion instead of its own copy of the rule ("replacing the inline `name === '' || name.includes('*') || name.includes('?') || name.startsWith('!')` exclusion in `outsideLiteralAliases` with a call to that shared predicate").
4. The case-insensitive first-spelling `seen` logic stays exactly as it is ("Keep the case-insensitive first-spelling `seen` logic in `outsideLiteralAliases` unchanged").
5. No name changes classification in either path ("this is a refactor that removes a second definition, not a change to which names count as literal").
6. Both existing suites keep pinning the literal, wildcard, negated, and empty cases ("Verify against the existing `src/plugins/hosts/ssh-config/parse.test.ts` and `src/plugins/hosts/ssh-config/section.test.ts`, which already cover literal, wildcard (`Host web*`), negated, and empty names").
7. A case that asserts both paths agree exists only if none does already ("add a cross-module case only if one is missing").

## Design decisions

- Export the existing `isLiteralName` in place rather than moving it to a third module. Both consumers already live in the same directory and `section.ts` already imports from `./parse.js`, so the smallest change gives one definition without a new file (Requirements 1 and 2).
- Replace only the four-part inline exclusion in `outsideLiteralAliases` with the negated call `!isLiteralName(name)`. The inline rule is the exact logical complement of the predicate, so this removes a definition without changing a classification (Requirements 3 and 5).
- Leave the order of operations in `outsideLiteralAliases` alone: the exclusion still runs before the lowercase key is computed, and the `seen` set still keeps the first spelling. No other line in the loop changes (Requirement 4).
- Add one cross-module case because neither suite currently imports both modules: `parse.test.ts` imports only `./parse.js` and `section.test.ts` imports only `./section.js`. The case asserts the two paths classify the same mixed config identically, which is the invariant the refactor establishes (Requirement 7).
- Keep every existing test case byte for byte; this is a refactor, so the change is proved by the current suites plus one new case (Requirements 5 and 6).
- Add no comments. The exported predicate's name already states the rule, and the task calls for clean code without new commentary.

## Preserved behavior

1. `readEffectiveAliases` still emits only literal names and still excludes wildcards, negated names, and empty names; it must not start emitting patterns. Pinned by `src/plugins/hosts/ssh-config/parse.test.ts` › `readEffectiveAliases > lists only literal names from Host lines`.
2. `outsideLiteralAliases` still folds names without regard to case and reports the first spelling only; it must not emit both spellings or switch to the later one. Pinned by `src/plugins/hosts/ssh-config/section.test.ts` › `findManagedSections > reports literal aliases outside complete sections only` (`Keep` followed by `keep`).
3. `outsideLiteralAliases` still reports aliases found outside complete managed sections only, leaving names inside a section out; it must not start reporting the managed alias. Pinned by `src/plugins/hosts/ssh-config/section.test.ts` › `findManagedSections > reports literal aliases outside complete sections only` (`not.toContain('inside')`).
4. Imports under `ssh-config/` still stay inside `./` or package specifiers with `.js` extensions; the new import must not introduce a `../` path or a bare relative specifier. Pinned by `src/plugins/hosts/ssh-config/section.test.ts` › `module imports > keeps imports inside ./ or package specifiers with .js extensions`.

## Assumptions

1. The predicate already exists in the reader module with the exact rule to reuse: `src/plugins/hosts/ssh-config/parse.ts:86` `function isLiteralName(name: string): boolean {` with `:87` `name !== '' && !name.includes('*') && !name.includes('?') && !name.startsWith('!')`.
2. The managed-section module holds the second copy inline: `src/plugins/hosts/ssh-config/section.ts:61` `if (name === '' || name.includes('*') || name.includes('?') || name.startsWith('!')) continue;`.
3. The two modules are siblings and the section module already imports the tokenizer with a `.js` extension: `src/plugins/hosts/ssh-config/section.ts:1` `import { tokenizeSshConfig } from './parse.js';`.
4. The first-spelling case-folded `seen` logic sits immediately after the inline exclusion and is independent of it: `src/plugins/hosts/ssh-config/section.ts:62` `const key = name.toLowerCase();` through `:65` `aliases.push(name);`.
5. The predicate is already consumed by the alias reader's own loop: `src/plugins/hosts/ssh-config/parse.ts:190` `if (!isLiteralName(name) || seen.has(key)) continue;`, so exporting it changes no existing call site.
6. Tests are colocated and import production modules with `.js` extensions: `src/plugins/hosts/ssh-config/parse.test.ts:3` `import { readEffectiveAliases, tokenizeSshConfig } from './parse.js';` and `src/plugins/hosts/ssh-config/section.test.ts:3` `import { findManagedSections, serializeManagedSection, spliceManagedSection } from './section.js';`.
7. An empty name is reachable through the tokenizer from a quoted empty argument, so the empty case can appear in a cross-module case: `src/plugins/hosts/ssh-config/parse.ts:41` `args.push(value);` with `:34` to `:39` building `value` from quoted characters.
8. `parse.ts` is 199 lines, so adding the `export` keyword to an existing line does not approach the 200-line `max-lines` cap.

## Existing functionality

1. The literal-name predicate to export: `src/plugins/hosts/ssh-config/parse.ts:86` `function isLiteralName(name: string): boolean {`.
2. The existing same-directory import to extend: `src/plugins/hosts/ssh-config/section.ts:1` `import { tokenizeSshConfig } from './parse.js';`.
3. The alias-reader suite that pins literal classification: `src/plugins/hosts/ssh-config/parse.test.ts:140` `describe('readEffectiveAliases', () => {`.
4. The managed-section suite that pins outside-alias reporting: `src/plugins/hosts/ssh-config/section.test.ts:9` `describe('findManagedSections', () => {`.
5. The import-convention guard both suites enforce: `src/plugins/hosts/ssh-config/section.test.ts:192` `describe('module imports', () => {`.

## Implementation steps

Every step ends green under `$janissary/scripts/run.mjs check-diff`, which is each step's build command.

1. In `src/plugins/hosts/ssh-config/parse.ts`, add `export` to the existing `isLiteralName` declaration and leave its body, its call site in `readEffectiveAliases`, and every other line untouched. No new import and no new comment. Build with `$janissary/scripts/run.mjs check-diff`.
2. In `src/plugins/hosts/ssh-config/section.ts`, extend the existing `./parse.js` import to bring in `isLiteralName`, then replace only the inline `name === '' || name.includes('*') || name.includes('?') || name.startsWith('!')` exclusion in `outsideLiteralAliases` with `!isLiteralName(name)`. Leave the `seen` key, its case-insensitive check, the first-spelling push, and the rest of the module untouched. Build with `$janissary/scripts/run.mjs check-diff`.

## UI design

1. No user interface surface changes. The fix is internal to two pure parsing modules: no command, flag, key binding, dialog, or client component is added or changed.

## Tests

Add one cross-module case to `src/plugins/hosts/ssh-config/section.test.ts`, importing `readEffectiveAliases` from `./parse.js` alongside the existing section import and using the file's existing `toEqual` style. The case feeds a single config containing a literal name, a second literal name, a case-variant duplicate of the first, a `Host web*` wildcard, a `Host !blocked` negated name, and a `Host ""` empty name, then asserts that `findManagedSections(...).outsideAliases` equals `readEffectiveAliases(...)` mapped to its `name` field. This proves that both paths accept the same literals, reject the same non-literals, and keep the same first spelling (Requirements 3, 5, and 7).

Leave every case in `src/plugins/hosts/ssh-config/parse.test.ts` and every other case in `src/plugins/hosts/ssh-config/section.test.ts` byte for byte unchanged (Requirements 5 and 6, and Preserved behavior 1 to 4). Keep the new import inside `./` with a `.js` extension (Requirement 2 and Preserved behavior 4).

## Out of scope

- No change to the literal-name rule itself: empty names, `*`, `?`, and leading `!` still decide literal status exactly as before.
- No change to the case-insensitive first-spelling `seen` logic in either module.
- No new module, type, or third home for the predicate; the existing function is exported in place.
- No change to `tokenizeSshConfig`, `readEffectiveAliases`, `findManagedSections`, `serializeManagedSection`, or `spliceManagedSection` call signatures.
- No change to the pattern-complexity guard, the minimatch options, or any existing test case.
- No change to import, export, command verbs, intents, buttons, help pages, or the user/developer documentation trees.
- No description correction: the pull request text already describes the work.

## Verification

Run `$janissary/scripts/run.mjs check-diff`; lint, typecheck, and both test projects must pass, including the two untouched ssh-config suites and the new cross-module case.

Then run `npx vitest run --project server src/plugins/hosts/ssh-config/parse.test.ts src/plugins/hosts/ssh-config/section.test.ts` and read the new case. Confirm the mixed config yields the same name list from both paths, with the first spelling kept for the case-variant duplicate. A failure looks like a wildcard, negated, or empty name appearing in one list but not the other, or a second spelling appearing anywhere.

As the reader-performable check, read `src/plugins/hosts/ssh-config/parse.ts` beside `src/plugins/hosts/ssh-config/section.ts`: confirm `isLiteralName` is exported with its four-part rule unchanged and appears only once, that `section.ts` imports it from `./parse.js`, that `outsideLiteralAliases` calls `!isLiteralName(name)` where the inline exclusion used to be, and that the `seen` key and first-spelling push below it are untouched. A remaining inline exclusion, a second definition, or a changed `seen` block means the change was not made correctly.
