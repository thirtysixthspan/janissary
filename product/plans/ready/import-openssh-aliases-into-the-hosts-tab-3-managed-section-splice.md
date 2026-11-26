# Splice the Janissary-managed section of an ssh config
**Complexity: 6/10** — ~120 added lines, 16 requirements and 20 scenarios (p=5.78)

## Goal

Add a pure module that finds, serializes, and splices the `# BEGIN janissary hosts` section. It is the third piece of `import-openssh-aliases-into-the-hosts-tab.md`. `import-openssh-aliases-into-the-hosts-tab-8-export-operation.md` uses its section boundaries, outside-section alias list, and serializer when exporting the saved catalog; the tokenizer it reuses for alias names arrives in `import-openssh-aliases-into-the-hosts-tab-1-ssh-config-tokenizer.md`, and the literal-alias rule it mirrors arrives in `import-openssh-aliases-into-the-hosts-tab-2-effective-alias-reader.md`.

## Requirements

1. The managed section is the text from a `# BEGIN janissary hosts` line through the next `# END janissary hosts` line ("Managed section").
2. A BEGIN line with no following END line is ordinary text and not a section ("Treat as no section").
3. An END line with no preceding BEGIN line is ordinary text and not a section ("Treat as no section").
4. Every byte outside the managed sections stays identical after a splice ("Managed section").
5. When the file has no complete section, the new section is appended after the file's last line ("End of the file").
6. When the file has two or more complete sections, the first is rewritten and the later ones are removed ("Merge into one").
7. The line immediately after `# BEGIN janissary hosts` reads `# Managed by Janissary; edits inside this section are replaced on export.` ("Plus a header comment").
8. Each exported host is written with a `Host <name>` line ("Plus a header comment").
9. Each exported host is written with a `HostName <host>` line ("Plus a header comment").
10. A `User <user>` line is written only when the host has a saved user ("Plus a header comment").
11. A `Port <port>` line is written only when the host has a saved port ("Plus a header comment").
12. The setting lines are indented by four spaces ("Plus a header comment").
13. Exported hosts are separated by one blank line ("Plus a header comment").
14. Exported hosts are written in name order ignoring case ("Plus a header comment").
15. The module reports every literal `Host` alias outside the managed sections, for the export clash check ("Skip clashes, mirror catalog").
16. The module imports nothing through `../` (Assumption 3).

## Design decisions

Subplan 1 must land first because this module imports `./parse.js`; no code from subplan 2 is imported, but the literal-alias and first-spelling rules mirrored here are settled by Requirements 1 and 8 of `import-openssh-aliases-into-the-hosts-tab-2-effective-alias-reader.md`. `import-openssh-aliases-into-the-hosts-tab-8-export-operation.md` consumes this module, so it lands later.

- The new module is `src/plugins/hosts/ssh-config/section.ts`, beside `section.test.ts`. It imports `tokenizeSshConfig` from `./parse.js` with a `.js` extension and no `../` path, because the plugin boundary allowlist does not admit host internals (Assumption 3). It exports three functions named `findManagedSections`, `serializeManagedSection`, and `spliceManagedSection`; keep their types local and define a local structural record of `name`, `host`, `user?`, and `port?` instead of importing `SavedHost` from `hosts-values.ts` (Assumption 4).
- Section discovery scans the raw config text line by line for lines whose whole text equals `# BEGIN janissary hosts` or `# END janissary hosts`; it does not read markers from the tokenizer's blocks, because subplan 1 treats `#` as a comment and discards those lines. The first BEGIN starts a candidate section and the next END after it closes it; a marker inside a candidate, an END before any BEGIN, and a BEGIN with no later END are all ordinary text. A complete section's range is inclusive of its BEGIN and END lines. Lines are kept as raw text with their original bytes so bytes outside sections cannot drift.
- Splicing has exactly three modes: rewrite the first complete section, delete every complete section after the first, and append a new section after the last line when none is complete. Incomplete markers stay untouched as ordinary text. Copy every byte outside a replaced range verbatim by slicing the original text at line offsets, not by rejoining split lines, so CRLF and a missing trailing newline survive. The serialized section uses `\n` line endings, starts on a new line (insert one `\n` before BEGIN when the preceding text does not end with a newline), and ends with a trailing `\n`.
- The serializer takes already-validated records shaped like `SavedHost` (Assumption 4); it does not validate or import `hosts-values.ts`. Keep the header comment as one module-local constant so it is written once. It writes the `Host <name>` line at column 0, then four-space-indented `HostName <host>`, optional `User <user>`, and optional `Port <port>` lines from the stored fields, so a port is not folded into the destination string and `path` is ignored. Hosts use a stable case-insensitive sort like `sortHosts` (`src/plugins/hosts/hosts-file.ts:123` `function sortHosts(`), and exactly one blank line goes between consecutive hosts, none before the first or after the last.
- To report aliases outside complete sections, remove each complete section's lines from the config text and pass the remaining text to `tokenizeSshConfig` from `./parse.js`. From its `host` blocks keep only names with no `*` or `?` and no leading `!`, ignore `match` blocks, and fold by case keeping the first spelling, as Requirements 1 and 8 of `import-openssh-aliases-into-the-hosts-tab-2-effective-alias-reader.md` settle. A partial section stays in the remaining text, so its aliases are still reported. `section.ts` reports names verbatim and does not compare them: the case-insensitive clash check belongs to subplan 8, which can use `sameHostName`.
- An empty host list still serializes a section containing only the header comment, which is how `import-openssh-aliases-into-the-hosts-tab-8-export-operation.md` empties an existing section.

## Preserved behavior

None found. This subplan adds a new pure module with no production consumers yet, so no existing test is affected.

## Assumptions

1. The section markers and header text are settled in the source plan: `import-openssh-aliases-into-the-hosts-tab.md:41` `"The managed section is the text from a \`# BEGIN janissary hosts\` line through the next \`# END janissary hosts\` line"` and `:31` `"The line after \`# BEGIN janissary hosts\` reads \`# Managed by Janissary; edits inside this section are replaced on export.\`"`.
2. The tokenizer contract is delivered by subplan 1: `import-openssh-aliases-into-the-hosts-tab-1-ssh-config-tokenizer.md:26` ``Export one function, `tokenizeSshConfig`, from `parse.ts` ``, with `HostBlock` carrying `names` and `kind` marking `Match` blocks.
3. Importing from `./parse.js` obeys the NodeNext `.js` rule: `eslint.config.mjs:135` `js: 'always'`.
4. A concrete server plugin cannot import host internals through `../`: `eslint.plugin-boundaries.mjs:36` `regex: String.raw\`^\.\./(?!(?:api\.js|files\.js|`.
5. Saved hosts carry `name`, `host`, optional `user` and `port`, and optional `path`: `src/plugins/hosts/hosts-values.ts:3` `export type SavedHost = {`.
6. The literal-alias and first-spelling rules are settled by subplan 2: `import-openssh-aliases-into-the-hosts-tab-2-effective-alias-reader.md:10` `"Each name on a \`Host\` line with no \`*\` or \`?\` and no leading \`!\` is a literal alias"` and `:17` `"Aliases are folded by name ignoring case, keeping the spelling of the first appearance"`.

## Existing functionality

1. The `Host` and `Match` tokenizer is delivered by `import-openssh-aliases-into-the-hosts-tab-1-ssh-config-tokenizer.md:26` ``Export one function, `tokenizeSshConfig`, from `parse.ts` ``, which lands first.
2. The literal-alias and first-spelling rules are delivered by Requirements 1 and 8 of `import-openssh-aliases-into-the-hosts-tab-2-effective-alias-reader.md`.
3. Saved-host field layout to mirror as a local type: `src/plugins/hosts/hosts-values.ts:3` `export type SavedHost = {`.
4. Sorted, case-insensitive host ordering already has a precedent in `src/plugins/hosts/hosts-file.ts:123` `function sortHosts(`, which this module mirrors for the serialized section.
5. Vitest colocated tests are the house convention for `src/`: `src/plugins/hosts/hosts-file.test.ts` sits beside `src/plugins/hosts/hosts-file.ts`.

## Implementation steps

Every step ends green under `$janissary/scripts/run.mjs check-diff`, which is both the build command and the check that proves the step green. Do not start before subplan 1 has landed: this subplan imports `./parse.js`, and nothing later closes that reference. This subplan changes only two new files.

1. Add `src/plugins/hosts/ssh-config/section.ts`. Export `findManagedSections` taking the raw config text: it finds complete BEGIN/END pairs as inclusive line ranges and returns the text with those ranges removed plus the literal `Host` names outside them, obtained by tokenizing that remaining text with `tokenizeSshConfig` from `./parse.js` and applying the literal-name and first-spelling rules. Export `serializeManagedSection` taking the local saved-host records and returning the managed-section lines with the exact header comment, a `Host` line per host, four-space-indented settings, one blank line between hosts, and the stable case-insensitive order. Export `spliceManagedSection` taking the original text, the ranges, and the serialized section, returning text in one of the three modes from Requirements 5 and 6 with all other bytes copied verbatim and the newline rules from Design decisions. Keep all types local and import only `tokenizeSshConfig` from `./parse.js` and Node built-ins. Build with `$janissary/scripts/run.mjs check-diff`.
2. Add `src/plugins/hosts/ssh-config/section.test.ts` beside it, covering Requirements 1 to 16 and the decisions under Design decisions as listed under Tests. Use inline config strings and compare whole output strings so byte preservation is checked, not just parsed structure. Build with `$janissary/scripts/run.mjs check-diff`; it is both the build command and the check that proves the step green, and confirm the new test file and the existing server tests pass.

## UI design

1. No user interface surface changes. The module is pure text work with no command, intent, or client entry point.

## Tests

In `src/plugins/hosts/ssh-config/section.test.ts`, one case per group, each tied to its requirement:

- A complete BEGIN/END pair is found with an inclusive range; an unmatched BEGIN and an unmatched END are each treated as ordinary text (Requirements 1 to 3).
- Two BEGIN lines followed by one END pair the first BEGIN with the END; a second BEGIN inside the candidate stays ordinary text, so exactly one section is found (Design decisions).
- A marker line that is indented or has extra text is ordinary text, not a boundary (Design decisions).
- Splicing a file with no section appends after the last line, including when the file does not end with a newline and when it uses CRLF (Requirement 5).
- Two complete sections collapse to one: the first is rewritten and the later lines disappear (Requirement 6).
- Every byte above, between, and below sections survives a rewrite, checked by comparing the whole string (Requirement 4).
- Serialization places the exact header comment directly after BEGIN and emits `Host`, indented `HostName`, and conditional `User` and `Port` lines from stored fields, with no `path` line (Requirements 7 to 12).
- Two hosts appear in case-insensitive name order separated by one blank line, with no blank line before the first or after the last; a host with neither user nor port omits both lines (Requirements 13 and 14).
- An alias declared outside a section is reported, one declared inside a complete section is not, and one inside a partial BEGIN/END pair is reported (Requirement 15).
- An empty host list yields a section with only the header comment (supports the empty-section case in `import-openssh-aliases-into-the-hosts-tab-8-export-operation.md`).
- The test file's own imports stay inside `./` and package specifiers (Requirement 16).

## Out of scope

- No file read or write, no path resolution, no symlink handling, and no catalog access.
- No validation of saved hosts and no import of `hosts-values.ts`.
- No import operation, no clash decision, no notification, and no command or button.
- No case-insensitive name comparison and no use of `sameHostName`; this module reports names verbatim and subplan 8 owns the clash check.

## Verification

Run `$janissary/scripts/run.mjs check-diff`; lint, typecheck, and both test projects must pass with only these two new files.

Then run `npx vitest run --project server src/plugins/hosts/ssh-config/section.test.ts` and read one test's expected output string. Confirm a file holding a `Host keep` block above a managed section keeps that block byte for byte, that the managed section holds the exact header comment and a four-space-indented `HostName`, that a second managed section is gone, and that `Host keep` appears in the reported outside aliases. A failure looks like a changed byte above the section, a missing header comment, a surviving duplicate section, or a missing outside alias.

Then read `src/plugins/hosts/ssh-config/section.ts`: its only imports must be `tokenizeSshConfig` from `./parse.js` and Node built-ins, with no `../` path and no `hosts-values.ts` import; its only exports must be the three named under Design decisions; and the header comment must appear once as a module-local constant. This subplan adds no code to a path the running app exercises, so there is no end-to-end app check; a `../` import or a duplicated header string means the change was not made correctly.
