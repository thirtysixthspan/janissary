# Tokenize OpenSSH config into Host and Match blocks
**Complexity: 5/10** — ~100 added lines, 10 requirements, 20 test scenarios and 6 new units across two new files (p=5.44)

## Goal

Add the pure tokenizer that splits OpenSSH client-config text into ordered `Host` and `Match` blocks. It is the first piece of `import-openssh-aliases-into-the-hosts-tab.md`. `import-openssh-aliases-into-the-hosts-tab-2-effective-alias-reader.md` adds alias computation to the same module, and `import-openssh-aliases-into-the-hosts-tab-3-managed-section-splice.md` reuses the block stream to find managed sections.

## Requirements

1. `Include` directives are ignored ("~/.ssh/config only", option 2: "Include lines are ignored").
2. A `Host` line after an `Include` line still produces its block in file order ("Include lines are ignored").
3. Keywords match without regard to case (Implementation step 1, "case-insensitive keywords").
4. A keyword and its arguments may be separated by `=` or whitespace (Implementation step 1, "`=` or whitespace separators").
5. An argument may be double-quoted (Implementation step 1, "quoted arguments").
6. `#` begins a comment (Implementation step 1, "`#` comments").
7. The tokenizer produces one `Host` block per `Host` line, in file order, carrying every name on that line (Implementation step 1, "tokenizes config text into `Host` and `Match` blocks").
8. The tokenizer produces `Match` blocks marked so their settings can be skipped later ("Ignore Match blocks").
9. An unrecognized keyword does not swallow the following lines as its arguments (Implementation step 1).
10. The module imports nothing through `../` (Assumption 1).

## Design decisions

Depends on nothing earlier. `import-openssh-aliases-into-the-hosts-tab-2-effective-alias-reader.md` extends the same module, and `import-openssh-aliases-into-the-hosts-tab-3-managed-section-splice.md` consumes the block stream, so both land after it.

- All ssh-config parsing lives in the `src/plugins/hosts/ssh-config/` namespace, as the source plan settles. This subplan adds `parse.ts` with the tokenizer; the alias-reader subplan adds the alias reader to that same file. Only Node built-ins are imported here; package matching arrives in the alias-reader subplan.
- Export one function, `tokenizeSshConfig`, from `parse.ts`, returning an ordered array of blocks. Name the exported block types `SshConfigBlock`, `HostBlock`, `MatchBlock`, and `SshSetting`, and keep them local to the module. Each block carries a `kind` of `host` or `match`; a `HostBlock` holds its `names` as raw strings, a `MatchBlock` holds its `criteria` as raw strings, and both hold an ordered `settings` array of keyword/value pairs. The `kind` value is the marker the alias reader uses to skip `Match` settings.
- One token pass produces the blocks in file order. Every non-block keyword line after a `Host` or `Match` line is a setting of that block until the next block line; keyword lines before the first block are consumed and belong to no block. A `Host` or `Match` line with no arguments still produces a block with an empty `names` or `criteria` array. Names and criteria are kept verbatim and in order, including repeats; case folding into aliases is the alias reader's job.
- `Include` and every other unrecognized keyword are consumed as a single line and never activate following lines. This is how the "Include lines are ignored" rule is enforced without special-casing a directive that would otherwise need a file read.
- Double quotes protect an argument's spaces; single quotes are ordinary characters and backslash escapes are not processed, matching the feature's "Inside quotes there are no escapes" rule (`import-openssh-aliases-into-the-hosts-tab.md` Requirement 50). An unterminated double quote consumes the rest of the line as one argument. A `#` outside quotes starts a comment and truncates the line. The first `=` directly after a keyword is the separator; later `=` characters stay in argument text. A trailing backslash does not continue a line; each physical line is scanned independently. Keywords are folded to lowercase before comparison so `HOST`, `Host`, and `host` behave alike.
- Empty text, or text with only comments and non-block keyword lines, yields an empty block list.
- The repo's `readToken` and `skipSpaces` at `src/command/quoted-token.ts:22` `export function readToken(` are the house quote scanner, but a `ssh-config/` module cannot import them: the plugin boundary allowlist has no `../command/` entry (Assumption 1), and they accept single quotes and escapes that this grammar does not. `parse.ts` scans each line locally instead.
- The exported block types are local to `parse.ts`. No barrel or `index.ts` is created, and no `../` path appears, because the plugin boundary does not admit host internals (Assumption 1) and direct imports are the house rule.

## Preserved behavior

None found. This subplan adds two new files with no production consumers yet, so no existing behavior or test is affected.

## Assumptions

1. A concrete server plugin cannot import host internals through `../`: `eslint.plugin-boundaries.mjs:36` `regex: String.raw\`^\.\./(?!(?:api\.js|files\.js|` allowlists only the documented modules, and `src/plugins/hosts/ssh-config/` sits two levels under `src/plugins/`.
2. The config grammar this tokenizer must accept is settled in the source plan's Implementation step 1: `import-openssh-aliases-into-the-hosts-tab.md:140` `"case-insensitive keywords, \`=\` or whitespace separators, quoted arguments, and \`#\` comments"`.
3. Vitest colocated tests are the house convention for `src/`: `src/plugins/hosts/hosts-values.test.ts:1` `import { describe, expect, it } from 'vitest';` sits beside `src/plugins/hosts/hosts-values.ts`.

## Existing functionality

1. The project's `minimatch` dependency is installed, though matching belongs to the alias-reader subplan: `package.json:114` `"minimatch": "^11.0.8"` in `dependencies`, in use at `src/file-glob/match.ts:1` `import { Minimatch } from 'minimatch';`.
2. The repo's quote-aware tokenizer is `readToken`/`skipSpaces` at `src/command/quoted-token.ts:22` `export function readToken(`, but the plugin boundary cannot reach it (Assumption 1), so this subplan scans lines locally with double quotes only.
3. Vitest colocated tests are the house convention for `src/`: `src/plugins/hosts/hosts-values.test.ts:1` `import { describe, expect, it } from 'vitest';` beside `src/plugins/hosts/hosts-values.ts`.

## Implementation steps

Every step ends green under `$janissary/scripts/run.mjs check-diff`. This subplan changes two new files; nothing imports them yet, so the file list is sufficient to compile at this commit and no later work closes a reference.

1. Add `src/plugins/hosts/ssh-config/parse.ts` with the tokenizer described under Design decisions. Export `tokenizeSshConfig` and the block types it returns, keeping them local to the module. Implement Requirements 1 to 10 and the edge decisions under Design decisions, with no I/O and no `../` import. Build with `$janissary/scripts/run.mjs check-diff`.
2. Add `src/plugins/hosts/ssh-config/parse.test.ts` beside it, covering Requirements 1 to 10 and the edge decisions as listed under Tests. Import the tokenizer from `./parse.js`, the `.js` extension required by `eslint.config.mjs:135` `js: 'always'`. Use inline config strings and assert whole block lists so ordering and markers are checked. Build with `$janissary/scripts/run.mjs check-diff` and confirm both the new test and the existing server tests pass.

## UI design

1. No user interface surface changes. The module is a pure tokenizer with no command, intent, or client entry point.

## Tests

In `src/plugins/hosts/ssh-config/parse.test.ts`:

- An `Include` line is consumed without affecting the blocks around it (Requirements 1 and 2).
- A lowercase, uppercase, and mixed-case keyword produce the same block (Requirement 3).
- An `=` separator and a whitespace separator both yield the same arguments (Requirement 4).
- A quoted argument keeps its spaces; a `#` outside quotes truncates the line; an unterminated quote yields one argument holding the rest of the line (Requirements 5 and 6).
- A `Host` line with several names produces one block carrying all of them in order, repeats included; a `Match` line produces a block whose `kind` marks it for skipping (Requirements 7 and 8).
- A `Host` or `Match` line with no arguments produces a block with an empty names or criteria array (Requirements 7 and 8).
- An unknown keyword on its own line does not absorb the next line's settings; a setting before the first block belongs to no block, and a setting after a block attaches to that block until the next block line (Requirement 9).
- Empty text, comment-only text, and text with no block lines yield an empty block list (Requirements 1 and 7).

## Out of scope

- No alias list, no pattern matching, no effective-value computation, and no `%` expansion; the alias-reader subplan owns those.
- No managed-section discovery and no serialization; the managed-section-splice subplan owns those.
- No file read or write, path resolution, catalog access, command, intent, or button.

## Verification

Run `$janissary/scripts/run.mjs check-diff`; lint, typecheck, and both test projects must pass with only these two new files.

Then run `npx vitest run --project server src/plugins/hosts/ssh-config/parse.test.ts` and read the block-list assertion. Confirm a config with `Include other`, `Host web1 web2`, `Match user ops`, and a `#` comment yields two ordered blocks, the first carrying both names, the second marked as a `Match` block, and no effect from the `Include` line. A failure looks like a block for the included file, a lost second name, a setting before the first block attached to the wrong block, or a `../` import.

Read `src/plugins/hosts/ssh-config/parse.ts` as a third check: its only exports must be `tokenizeSshConfig` and the block types named under Design decisions, and it must contain no `../` import and no file I/O (Requirement 10).
