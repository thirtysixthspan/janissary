# technical-debt

## ready

* Re-check the lock file at deletion time so shutdown cannot remove a lock another instance just took over.

Existing Debt: Lock release reads the pid and then deletes unconditionally, while acquisition treats a changed lock as a reason to refuse, so the two sides apply different rules to the same race. Severity: 6/10

Existing Risk: 6/10 - If the lock is judged stale and replaced between the read and the delete, shutdown removes the new owner's lock and a third process is admitted into the same directory.

Proposal Risk: 2/10 - The delete becomes conditional on the content, but the read and delete remain separate syscalls, so a narrow race survives unless an atomic compare-and-delete is available.

Proposal: `src/instance-lock.ts` `releaseLock` calls `readLockPid(projectDir)` and then `rmSync(lockPath(projectDir), { force: true })`. `acquireLock` in the same file uses `clearIfStale(file, content)` from `src/pid-lock-file.ts`, which deletes only when the file still holds the content it judged stale. Reuse that guarded removal in `releaseLock`: read the exact file content, re-read immediately before removal, and delete only if unchanged and still naming this process. `src/instance-lock.test.ts` covers only sequential release cases for matching, foreign and invalid pids; add a case where the lock content changes between the first read and the removal and assert the new content survives.


* Recognize native ACP commands from one vocabulary so gating and extraction cannot disagree about what a command is.

Existing Debt: The same native-command vocabulary is recognized by two independent mechanisms whose rules are kept in sync by hand. Severity: 5/10

Existing Risk: 5/10 - Adding or rewording a native command in one place narrows gating or extraction on the same path, so a command the model is told it may run is refused or never extracted from its reply.

Proposal Risk: 2/10 - One recognizer feeds both paths, but the per-tool line matchers still have their own predicates, so a reply-line form one of them misses remains invisible.

Proposal: `src/acp/native-commands.ts` `nativeCommandName` recognizes commands by splitting `NATIVE_ACP_COMMANDS` and matching token prefixes, while `src/acp/tool-table.ts` `createAcpToolTable` gives each tool its own `match` predicate: regexes for browser, question and file, `isWebCommandLine` for web, and a `match: () => true` database fall-through. `gateCoreCommand` and `toolExtractor` in `tool-table.ts` call both recognizers on the same command. Export one predicate over `NATIVE_ACP_COMMANDS` that both the tool-table entries and `nativeCommandName` consume, keeping the database fall-through explicit. `src/acp/native-commands.test.ts` and `src/acp/tool-table.test.ts` test each recognizer alone; add a parity test walking every `NATIVE_ACP_COMMANDS` entry through both and asserting identical recognition.


* Share one recurrence validator between the schedule parser and the stored-entry decoder so persisted entries keep the parser's rules.

Existing Debt: The grammar of a valid schedule entry is spelled out twice, once while parsing user input and again while decoding persisted entries, with the second copy relying on casts to narrow `unknown`. Severity: 5/10

Existing Risk: 5/10 - A change to accepted time, interval or weekday rules on the parser side leaves stored entries validated by the old rules, so a schedule can be created one way and silently accepted or dropped differently after a reload.

Proposal Risk: 2/10 - One validator is used at both boundaries, but the stored snapshot still has its own version gate and command-string check, so those can drift independently.

Proposal: `src/schedule/parsing.ts` `parseTimeOfDay` and `parseInterval`, together with `src/schedule/every-schedule.ts` `parseEverySchedule`, define the accepted clock, interval and weekday shapes; `src/schedule/system/store-decode.ts` `validClock`, `validEntry` and `hasNoRecurrenceFields` re-derive the same rules with casts such as `(time.hour as number)` and re-check `value.command !== \`script ${value.script}\``. Extract a shared guard module, for example `src/schedule/validity.ts`, exporting the clock, interval and recurrence validators, and call it from both the parser and the store decoder, leaving the version gate in `store-decode.ts`. `src/schedule/system/store-decode.test.ts` checks hand-picked invalid cases and `src/schedule/index.test.ts` covers the parser; add a round-trip test feeding parsed entries through the decoder plus a case where a stored entry violates a parser rule.


* Reject non-positive or non-integer terminal dimensions in asciicast headers before they reach the terminal emulator.

Existing Debt: The header parser validates only the JavaScript type of the terminal dimensions while its sibling resize parser validates their numeric shape, so the same value is trusted at one boundary and checked at the other. Severity: 5/10

Existing Risk: 5/10 - A recording whose header carries `Infinity`, a negative number or a fraction creates a terminal with a nonsensical size, so the tab renders blank, allocates an oversized grid, or throws during first render.

Proposal Risk: 2/10 - Dimensions are now safe integers, but very large finite values are still accepted, so a hostile recording can still request an expensive grid.

Proposal: `web/src/plugins/asciicast/cast-stream.ts` `parseCastHeader` checks only `typeof cols !== 'number' || typeof rows !== 'number'` and returns the header with those values; `createAppTerminal` in `web/src/plugins/asciicast/useAsciicastTerminal.ts` receives them directly. The same file's `parseResize` already requires `/^\d+$/u` on both parts. Require `Number.isSafeInteger` and a positive value for both dimensions in the header guard, reusing a shared positive-dimension predicate if the resize parser can use it too. `web/src/plugins/asciicast/cast-stream.test.ts` covers only the missing-size case; add cases for `Infinity`, a negative value and a fraction asserting the header is refused, and keep the resize parser cases passing.


* Trim resolved row-key buckets when a page begins, not only when a key is minted, so empty pages cannot grow the store without bound.

Existing Debt: The store's page buckets are created by one method and evicted by another, so the documented bound applies only when a page actually mints a key. Severity: 5/10

Existing Risk: 4/10 - Repeated queries that return no rows or keyless results push an empty bucket per page for the life of the browser, so a long session paging through empty results grows memory without eviction.

Proposal Risk: 2/10 - Empty buckets are evicted, but a page that mints keys and is then superseded still relies on eviction during a later mint, so a long idle gap can retain extra keys.

Proposal: `src/database/row-keys.ts` `RowKeyStore.beginPage` pushes a new bucket while only `mint` calls `trim`, and the comment above `RESOLVED_PAGES` claims the bound keeps the map from growing with use. Call `trim()` at the end of `beginPage` as well, so the bucket array stays bounded whether or not a page yields keys. `src/database/grid.ts` `runGrid` calls `beginPage` for every page including empty ones and should keep doing so. `src/database/write.test.ts` tests eviction only for pages that minted keys; add a case that begins more than `RESOLVED_PAGES` empty pages and asserts that buckets from the earlier pages were discarded before any later mint.


* Reduce the cognitive complexity of `orderedKeys()` in `src/native-commands/decode.ts` (line 9), reported at 23 against the allowed 15 in a file scoring 44.97 FTA across 67 lines. The function scans settings JSON text by hand to collect top-level keys, and the complexity comes from a character switch whose quoted-string case nests a second escape-aware loop over the same shared depth and expecting-key state. Lift the string-skipping loop into a local helper so the switch keeps only the delimiter cases. Resolve by running the `ai/tasks/hygiene/reduce-complexity.md` task against `orderedKeys()` in `src/native-commands/decode.ts`. Severity: **medium**.


* Reduce the cognitive complexity of `intent()` in `src/plugins/connections/activate.ts` (line 52), reported at 17 against the allowed 15 in a file scoring 48.50 FTA across 90 lines. The function dispatches a connections tab request by testing each intent name in turn and validating its payload branch by branch before delegating, so every new intent adds another guarded arm to the chain. Flatten the chain into a local per-intent lookup or lift the payload validation into a helper; the function is private to the activation module. Resolve by running the `ai/tasks/hygiene/reduce-complexity.md` task against `intent()` in `src/plugins/connections/activate.ts`. Severity: **low**.

## development

## deferred

* Replace the inert import-cycle lint rule with a tested import-graph check that fails on real runtime cycles. — deferred: complexity 8/10, requires a new static-analysis tool with a parser, resolver and graph traversal plus breaking four real runtime cycles across the command, agent and remote registries.

Existing Debt: `eslint.config.mjs` sets `'import-x/no-cycle': 'error'` while its own note says the rule's graph traversal does not fire in this setup and recommends a manual `npx madge --circular --extensions ts,tsx src` instead, and no script, test, or CI step runs that command, so the configured guard is documentation rather than enforcement. Severity: 5/10

Existing Risk: 5/10 - An import cycle can land with every check green and surface only as an undefined binding at module evaluation, a plugin activation that never runs, or a client entry chunk that pulls host code in, all of which look like unrelated bugs at the call site.

Proposal Risk: 2/10 - The graph check fails on real runtime cycles; the residual risk is a cycle formed through syntax the scanner does not parse, which the check should report as unanalysed rather than silently skip.

Proposal: Add `scripts/import-cycles.mjs`, run through `$janissary/scripts/run.mjs` and wired into the `check` script in `package.json` and the `check-diff` orchestrator in `scripts/check-diff.mjs` when `src/` or `web/src/` changed, that walks `src/**/*.ts` and `web/src/**/*.{ts,tsx}`, parses static `import`/`export ... from` specifiers, records whether each statement is type-only, resolves relative `.js`/extensionless specifiers to files, and reports every cycle containing at least one runtime edge. Add `scripts/import-cycles.test.mjs` with synthetic trees covering a two-file runtime cycle (fails), an all-`import type` cycle (passes, because TypeScript erases it), a cycle through `export ... from` (fails), and a self-import (fails), following the fixture style in `scripts/help-doc-changes.test.mjs`. Run the check against the current tree before enabling the gate; if it finds a pre-existing runtime cycle, fix it in the same change rather than adding a silent allowlist. The completed `product/plans/complete/split-types-by-domain.md` records that a manual madge run reported many type-only edges, which is why the runtime-only rule matters. Remove the `import-x/no-cycle` entry and its note from `eslint.config.mjs`; `src/eslint-plugin-boundaries.test.ts` and `src/eslint-feature-boundaries.test.ts` stay as they are because they test rules that do fire.

* Move the file-safety policy, refusal vocabulary, and remote-tab helpers out of the read and navigator features into one shared file-operations module. — deferred: complexity 8/10, a very large mechanical move spanning roughly 50 import sites across many features.

Existing Debt: Workspace containment, secret-path, protected-path, and size policy live in `src/file-read/policy.ts`, the shared result type and reason vocabulary live in `src/file-navigator/file-operation-result.ts`, and the remote-tab bridge and its typed-output helpers live in `src/file-read/remote-tab-port.ts` and `src/file-read/tab-read.ts`, so write, patch, glob, grep, web-search, ACP, and controller modules all import across a feature boundary for rules none of those features owns. Severity: 6/10

Existing Risk: 6/10 - A new file command that copies one containment check but omits the real-path, secret, or protected-path check ships a traversal or secret read, and a change made under the read feature silently alters write, patch, glob, and grep behavior without those owners seeing it.

Proposal Risk: 2/10 - The work is a mechanical move plus import rewrites, with policy and refusal behavior pinned by existing unit and contract tests; the residual risk is a missed import site, which the typechecker catches.

Proposal: Create `src/file-operations/` and move the four shared substrates into it: `src/file-read/policy.ts`, `src/file-navigator/file-operation-result.ts`, `src/file-read/remote-tab-port.ts`, and the `localReadRoot`, `asTyped`, and `rejectionLine` helpers from `src/file-read/tab-read.ts` (into a new `tab-command.ts`, leaving `readFileInTab` alone in `tab-read.ts`). Update every relative import: the 24 `policy.js` sites across `src/file-grep`, `src/file-glob`, `src/file-write`, `src/file-patch`, and `src/file-navigator`, including their tests; the 26 `file-operation-result.js` sites across `src/file-write`, `src/file-patch`, `src/file-read`, `src/file-grep`, `src/tab`, `src/remote`, and `src/commands`, including their tests; the `remote-tab-port.js` sites in `src/file-glob/tab-glob.ts`, `src/file-grep/tab-grep.ts`, `src/web/search/tab-search.ts`, `src/web/fetch/tab-fetch.ts`, `src/file-write/tab-write.ts`, and `src/file-write/outcome.ts`; and the `tab-read.js` helper sites in `src/file-grep/tab-grep.ts`, `src/file-glob/tab-glob.ts`, `src/file-write/tab-write.ts`, `src/web/search/tab-search.ts`, `src/web/fetch/tab-fetch.ts`, and `src/controller/completion.ts`. Move the colocated tests (`policy.test.ts`, `file-operation-result.test.ts`, `remote-tab-port.test.ts`, `tab-read.test.ts`) with their modules and keep exports, error strings, and refusal sentences byte-for-byte so `src/remote/serve-file-navigator.test.ts`, `src/remote/file-navigator-refusal-contract.test.ts`, and the file-grep, file-glob, file-write, and file-patch suites keep passing unchanged. Relative server imports keep the `.js` suffix; the moved modules are leaves, so the move creates no cycle. If the diff is too large for one pass, land `policy.ts` and `file-operation-result.ts` first, since they carry the security checks, and the tab helpers second.


* Define each file and web command's flags once, and generate its parser, completion candidates, and usage text from that definition. — deferred: complexity 8/10, introduces a new CommandSpec architecture rewritten across five command parsers and three completion modules.

Existing Debt: The flag grammar for `file read`, `file glob`, `file grep`, and `web search` is written out three times — a hand-rolled scanner in each command module, a second flag list and argument state machine in `src/completion/file-read.ts`, `src/completion/file-grep.ts`, and `src/completion/web.ts`, and a third copy in each usage constant and primer — with four different scanner idioms and different flag/positional ordering rules. Severity: 6/10

Existing Risk: 4/10 - A flag added to a parser but not to the completion lists is silently uncompletable, and the ordering rules already differ enough that a caller cannot rely on one command behaving like another: `file glob` accepts flags after the pattern, `file grep` requires them before and supports `--`, and `web search` requires the query first.

Proposal Risk: 2/10 - Parser and completion are driven from the same spec, so drift becomes a type error or a failing completion test; the residual risk is an acceptance change in one command, which its existing parser suite should catch.

Proposal: Add `src/command-line/spec.ts` with a `CommandSpec` that names the command path, positional shape (including "rest of the line"), and each flag's kind (switch or value), value validator, completion source, and usage fragment, plus `parseArgs(spec, tokens)` returning either values or a usage failure. Express the current rules as spec options rather than changing them: `file grep` keeps flags-before-pattern, `--`, and duplicate-flag rejection; `file glob` keeps its any-order flags and no terminator; `file read` keeps its trailing flags; `web search` keeps the query first and its flag section second. Replace `scanArguments` in `src/file-read/command.ts`, `src/file-glob/command.ts`, and `src/file-grep/command.ts` with calls to the shared parser, and extend the same to the web commands `src/web/search/command.ts` and `src/web/fetch/command.ts` (`parseWebFetch`, `WEB_FETCH_USAGE`), whose scan loop is already the shared `scanFlagArguments` in `src/web/flag-scan.ts` rather than a local `scanArguments`; keep `parseFileRead`, `parseFileGlob`, `parseFileGrep`, `parseWebSearch`, and `parseWebFetch` signatures and error strings so `src/file-read/command.test.ts`, `src/file-glob/command.test.ts`, `src/file-grep/command.test.ts`, `src/web/search/command.test.ts`, and `src/web/fetch/command.test.ts` are unchanged. Generate `FILE_READ_USAGE`, `FILE_GLOB_USAGE`, `FILE_GREP_USAGE`, `WEB_SEARCH_USAGE`, `WEB_FETCH_USAGE`, and the primer lines from the specs, and have `src/completion/file-read.ts`, `src/completion/file-grep.ts`, and `src/completion/web.ts` read candidates from the specs, deleting `FILE_READ_FLAGS`, `FILE_GLOB_FLAGS`, `FILE_GREP_FLAGS`, `FILE_GREP_SWITCHES`, `FILE_GREP_VALUE_FLAGS`, `grepArgumentState`, `SEARCH_FLAGS`, `FETCH_FLAGS`, `FORMAT_VALUES`, and `DEPTH_VALUES`; their suites (`src/completion/file-read.test.ts`, `file-grep.test.ts`, `web.test.ts`) pin the candidate lists. Leave `file write`, `file edit`, and `file patch` out of this pass because their one-line JSON payload grammar is a different shape.

## declined
