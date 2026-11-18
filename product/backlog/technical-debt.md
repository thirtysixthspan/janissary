# technical-debt

## ready

* Move the file-safety policy, refusal vocabulary, and remote-tab helpers out of the read and navigator features into one shared file-operations module.

Existing Debt: Workspace containment, secret-path, protected-path, and size policy live in `src/file-read/policy.ts`, the shared result type and reason vocabulary live in `src/file-navigator/file-operation-result.ts`, and the remote-tab bridge and its typed-output helpers live in `src/file-read/remote-tab-port.ts` and `src/file-read/tab-read.ts`, so write, patch, glob, grep, web-search, ACP, and controller modules all import across a feature boundary for rules none of those features owns. Severity: 6/10

Existing Risk: 6/10 - A new file command that copies one containment check but omits the real-path, secret, or protected-path check ships a traversal or secret read, and a change made under the read feature silently alters write, patch, glob, and grep behavior without those owners seeing it.

Proposal Risk: 2/10 - The work is a mechanical move plus import rewrites, with policy and refusal behavior pinned by existing unit and contract tests; the residual risk is a missed import site, which the typechecker catches.

Proposal: Create `src/file-operations/` and move the four shared substrates into it: `src/file-read/policy.ts`, `src/file-navigator/file-operation-result.ts`, `src/file-read/remote-tab-port.ts`, and the `localReadRoot`, `asTyped`, and `rejectionLine` helpers from `src/file-read/tab-read.ts` (into a new `tab-command.ts`, leaving `readFileInTab` alone in `tab-read.ts`). Update every relative import: the 24 `policy.js` sites across `src/file-grep`, `src/file-glob`, `src/file-write`, `src/file-patch`, and `src/file-navigator`, including their tests; the 26 `file-operation-result.js` sites across `src/file-write`, `src/file-patch`, `src/file-read`, `src/file-grep`, `src/tab`, `src/remote`, and `src/commands`, including their tests; the `remote-tab-port.js` sites in `src/file-glob/tab-glob.ts`, `src/file-grep/tab-grep.ts`, `src/web/search/tab-search.ts`, `src/web/fetch/tab-fetch.ts`, `src/file-write/tab-write.ts`, and `src/file-write/outcome.ts`; and the `tab-read.js` helper sites in `src/file-grep/tab-grep.ts`, `src/file-glob/tab-glob.ts`, `src/file-write/tab-write.ts`, `src/web/search/tab-search.ts`, `src/web/fetch/tab-fetch.ts`, and `src/controller/completion.ts`. Move the colocated tests (`policy.test.ts`, `file-operation-result.test.ts`, `remote-tab-port.test.ts`, `tab-read.test.ts`) with their modules and keep exports, error strings, and refusal sentences byte-for-byte so `src/remote/serve-file-navigator.test.ts`, `src/remote/file-navigator-refusal-contract.test.ts`, and the file-grep, file-glob, file-write, and file-patch suites keep passing unchanged. Relative server imports keep the `.js` suffix; the moved modules are leaves, so the move creates no cycle. If the diff is too large for one pass, land `policy.ts` and `file-operation-result.ts` first, since they carry the security checks, and the tab helpers second.


* Define each file and web command's flags once, and generate its parser, completion candidates, and usage text from that definition.

Existing Debt: The flag grammar for `file read`, `file glob`, `file grep`, and `web search` is written out three times — a hand-rolled scanner in each command module, a second flag list and argument state machine in `src/completion/file-read.ts`, `src/completion/file-grep.ts`, and `src/completion/web.ts`, and a third copy in each usage constant and primer — with four different scanner idioms and different flag/positional ordering rules. Severity: 6/10

Existing Risk: 4/10 - A flag added to a parser but not to the completion lists is silently uncompletable, and the ordering rules already differ enough that a caller cannot rely on one command behaving like another: `file glob` accepts flags after the pattern, `file grep` requires them before and supports `--`, and `web search` requires the query first.

Proposal Risk: 2/10 - Parser and completion are driven from the same spec, so drift becomes a type error or a failing completion test; the residual risk is an acceptance change in one command, which its existing parser suite should catch.

Proposal: Add `src/command-line/spec.ts` with a `CommandSpec` that names the command path, positional shape (including "rest of the line"), and each flag's kind (switch or value), value validator, completion source, and usage fragment, plus `parseArgs(spec, tokens)` returning either values or a usage failure. Express the current rules as spec options rather than changing them: `file grep` keeps flags-before-pattern, `--`, and duplicate-flag rejection; `file glob` keeps its any-order flags and no terminator; `file read` keeps its trailing flags; `web search` keeps the query first and its flag section second. Replace `scanArguments` in `src/file-read/command.ts`, `src/file-glob/command.ts`, and `src/file-grep/command.ts` with calls to the shared parser, and extend the same to the web commands `src/web/search/command.ts` and `src/web/fetch/command.ts` (`parseWebFetch`, `WEB_FETCH_USAGE`), whose scan loop is already the shared `scanFlagArguments` in `src/web/flag-scan.ts` rather than a local `scanArguments`; keep `parseFileRead`, `parseFileGlob`, `parseFileGrep`, `parseWebSearch`, and `parseWebFetch` signatures and error strings so `src/file-read/command.test.ts`, `src/file-glob/command.test.ts`, `src/file-grep/command.test.ts`, `src/web/search/command.test.ts`, and `src/web/fetch/command.test.ts` are unchanged. Generate `FILE_READ_USAGE`, `FILE_GLOB_USAGE`, `FILE_GREP_USAGE`, `WEB_SEARCH_USAGE`, `WEB_FETCH_USAGE`, and the primer lines from the specs, and have `src/completion/file-read.ts`, `src/completion/file-grep.ts`, and `src/completion/web.ts` read candidates from the specs, deleting `FILE_READ_FLAGS`, `FILE_GLOB_FLAGS`, `FILE_GREP_FLAGS`, `FILE_GREP_SWITCHES`, `FILE_GREP_VALUE_FLAGS`, `grepArgumentState`, `SEARCH_FLAGS`, `FETCH_FLAGS`, `FORMAT_VALUES`, and `DEPTH_VALUES`; their suites (`src/completion/file-read.test.ts`, `file-grep.test.ts`, `web.test.ts`) pin the candidate lists. Leave `file write`, `file edit`, and `file patch` out of this pass because their one-line JSON payload grammar is a different shape.


* Derive the application command inventory's built-in forms from the core command registry so a new command cannot silently miss the settings list.

Existing Debt: `src/application-commands.ts` keeps a hand-written `BUILTIN_FORMS` table keyed by command name that shadows `coreCommands` from `src/commands/index.ts`, and `buildApplicationCommands` silently skips any core command missing from the table, so the registry and its policy inventory are two lists that must be edited together with nothing checking that they were. Severity: 5/10

Existing Risk: 5/10 - A command added to `coreCommands` without a matching row disappears from `listApplicationCommands`, so it never appears in the command settings UI and its agent access cannot be revoked, while `disabledApplicationCommand` simply returns undefined and the command keeps running.

Proposal Risk: 2/10 - A parity test turns the omission into a failing build; the residual risk is a command that legitimately needs no settings row, which has to be named explicitly in the test's exception rather than skipped by a missing key.

Proposal: Move the table next to the registry it mirrors as `src/commands/forms.ts` exporting `COMMAND_FORMS` (the data currently in `BUILTIN_FORMS`), and have `src/application-commands.ts` import it and keep `builtinRows` unchanged. Add `src/application-commands.parity.test.ts` asserting four things: every `coreCommands` entry except `shell` (owned by the shell plugin and asserted absent in `src/application-commands.test.ts`) has a declaration; every declaration key names a live core command, so no stale rows; every declared form resolves through `resolveApplicationCommand` to a row whose `forms` contains that form; and every declared parent names a real command row. Do the test first and let it pass against the current table, then move the data in a second commit; `src/native-commands/settings-file.ts`, `policy.ts`, and `state.ts` keep consuming `listApplicationCommands` and need no change. The existing `src/commands.test.ts` shadow checks on `samples` stay as they are — samples describe dispatch, forms describe policy, and this entry does not merge them.


* Source the app's server-owned display limits from one settings object and remove the component fallback literals that shadow them.

Existing Debt: The tab-name limits and clipboard-history cap arrive in the state snapshot, but the client seeds them with its own `16`, `50`, and `15` in `web/src/useServerState.ts`, repeats `= 16` and `= 50` as optional prop defaults in `web/src/AppShell.tsx`, `web/src/Sidebar.tsx`, `web/src/TabStrip.tsx`, and `web/src/TabItem.tsx`, and hardcodes `tabNameMaxLength={50}` in `web/src/ReportingSection.tsx`, so the same server setting is declared in five places with no single source. Severity: 5/10

Existing Risk: 5/10 - A server config change or a missed prop falls back to a stale literal instead of failing, and reporting rows already truncate tab names at 50 while the configured inactive limit is 16, so the same tab can read differently in two surfaces with no test noticing.

Proposal Risk: 2/10 - Settings come from one provider seeded by the snapshot, so a forgotten consumer is a type error instead of a stale default; the residual risk is a leaf that still receives a literal from its caller, which a ReportingSection assertion now covers.

Proposal: Add `src/shared/config-defaults.ts` with `DEFAULT_TAB_NAME_MAX_LENGTH`, `DEFAULT_ACTIVE_TAB_NAME_MAX_LENGTH`, and `DEFAULT_CLIPBOARD_HISTORY_MAX_ENTRIES`, import them from `src/config.ts`, and seed `web/src/useServerState.ts` from the same module through `@shared/shared/config-defaults` (a runtime-value import, so confirm the path resolves in `web/tsconfig.json`, `web/vite.config.ts`, and the client project in `vitest.config.ts`, as `ai/guidelines/architecture-principles.md` requires). Replace `useTabNameLimits` and `useClipboardHistoryCap` with one `useAppSettings()` returning `{ settings, setSettings }` for the three values, and change `useServerState`'s `Setters` to take one `setSettings` that merges a partial settings object instead of the three individual setters it takes today (`setTabNameMaxLength`, `setActiveTabNameMaxLength`, `setClipboardHistoryMaxEntries`). Provide the object through an `AppSettingsProvider` beside `PluginChordProvider` in `web/src/App.tsx`, and have `web/src/Sidebar.tsx`, `web/src/ReportingSection.tsx`, and `web/src/AppCenterActionArea.tsx` read it and pass required values to `web/src/TabStrip.tsx` and `web/src/TabItem.tsx`; delete `AppMain.tsx`'s two length props, the two fields in `web/src/CenterActionAreaProps.ts`, and every `= 16`, `= 50`, and `tabNameMaxLength={50}` literal. Keep leaf components taking the narrow numbers they render rather than the whole settings object, per `ai/guidelines/react-code-organization.md`. Update `web/src/useServerState.test.ts`, `web/src/App.test.tsx`, `web/src/Sidebar.test.tsx`, `web/src/TabStrip.test.tsx`, and `web/src/ReportingSection.test.tsx`, and add a ReportingSection case that fails when reporting rows truncate at anything other than the configured inactive length. The server stays authoritative; this pass only deletes the client's copies.


* Replace the inert import-cycle lint rule with a tested import-graph check that fails on real runtime cycles.

Existing Debt: `eslint.config.mjs` sets `'import-x/no-cycle': 'error'` while its own note says the rule's graph traversal does not fire in this setup and recommends a manual `npx madge --circular --extensions ts,tsx src` instead, and no script, test, or CI step runs that command, so the configured guard is documentation rather than enforcement. Severity: 5/10

Existing Risk: 5/10 - An import cycle can land with every check green and surface only as an undefined binding at module evaluation, a plugin activation that never runs, or a client entry chunk that pulls host code in, all of which look like unrelated bugs at the call site.

Proposal Risk: 2/10 - The graph check fails on real runtime cycles; the residual risk is a cycle formed through syntax the scanner does not parse, which the check should report as unanalysed rather than silently skip.

Proposal: Add `scripts/import-cycles.mjs`, run through `$janissary/scripts/run.mjs` and wired into the `check` script in `package.json` and the `check-diff` orchestrator in `scripts/check-diff.mjs` when `src/` or `web/src/` changed, that walks `src/**/*.ts` and `web/src/**/*.{ts,tsx}`, parses static `import`/`export ... from` specifiers, records whether each statement is type-only, resolves relative `.js`/extensionless specifiers to files, and reports every cycle containing at least one runtime edge. Add `scripts/import-cycles.test.mjs` with synthetic trees covering a two-file runtime cycle (fails), an all-`import type` cycle (passes, because TypeScript erases it), a cycle through `export ... from` (fails), and a self-import (fails), following the fixture style in `scripts/help-doc-changes.test.mjs`. Run the check against the current tree before enabling the gate; if it finds a pre-existing runtime cycle, fix it in the same change rather than adding a silent allowlist. The completed `product/plans/complete/split-types-by-domain.md` records that a manual madge run reported many type-only edges, which is why the runtime-only rule matters. Remove the `import-x/no-cycle` entry and its note from `eslint.config.mjs`; `src/eslint-plugin-boundaries.test.ts` and `src/eslint-feature-boundaries.test.ts` stay as they are because they test rules that do fire.


* Use the shared path-containment rule for static assets instead of a string prefix so a sibling directory can never be served.

Existing Debt: The static server clamps requested paths with a string `startsWith` check while the project's containment rule is shared across the other file-serving paths, so the asset boundary is defined twice. Severity: 7/10

Existing Risk: 8/10 - A directory whose name shares the bundle directory's prefix lets a crafted URL select a path outside the bundle, because the check compares characters rather than path components.

Proposal Risk: 2/10 - The clamp becomes component-aware and falls back to the SPA shell, but the separate allow-list behind `/open/` remains a second guard that must stay intact.

Proposal: `src/serve-static.ts` `staticFileServer` normalizes the URL path and checks `if (!file.startsWith(options.webDir))`, falling back to `index.html`. `src/path-containment.ts` exports `containedAbsolute`/`containedPath`, and its header comment already names the serve process as a consumer, but this module imports none of it. Replace the prefix test with `containedAbsolute` on the resolved bundle directory, computing the absolute directory once when the server is built, and keep the SPA fallback for rejected paths. There is no `serve-static.test.ts`; `src/index.test.ts` covers origin rejection, SPA fallback, `/open/` token handling and malformed URLs but no traversal or prefix-sibling case. Add cases where the bundle directory has a sibling sharing its prefix and where the URL contains `../` segments, asserting the shell is served and no file outside the bundle directory is read.


* Refuse to create or overwrite a conversation written by a newer schema version instead of treating it as absent.

Existing Debt: The conversation store treats an exact schema-version match as the only valid document, so a record from a newer build is indistinguishable from a malformed one and can be replaced by a fresh conversation under the same id. Severity: 6/10

Existing Risk: 8/10 - After switching to an older build, a newer conversation is read as absent, a new one is created under the same id, and the next save overwrites the file, losing its turns with no warning.

Proposal Risk: 2/10 - A newer-version file is preserved and reported, but there is still no migration path, so those conversations stay unavailable until a build that understands their version runs.

Proposal: `src/conversations/store.ts` `isConversation` requires `value.schemaVersion === CONVERSATION_SCHEMA_VERSION`, and `read`/`scan` classify a mismatch as malformed. `src/conversations/manager.ts` `create` starts with `if (this.conversations.has(id) || this.store.read(id)) return false;`, so a version-mismatched file passes as absent and a replacement conversation is created and later written over it. Follow the pattern already in `src/schedule/system/store-decode.ts`, which returns `kind: 'unsupported-version'` for a future version: add a distinct decode outcome for a recognized-but-newer version, have `scan` report it without the malformed-file warning, and make `create` and the write paths refuse to overwrite such a record. `src/conversations/store.test.ts` exercises only version-1 and broken JSON documents; add a test writing a v2 document and asserting it is preserved and that `create` does not replace it.


* Make the ACP session handshake an explicit state so an early error cannot permanently suppress the connection.

Existing Debt: The connection handshake is tracked by three independent flags whose ordering is the protocol, and the error flag is never cleared, so an error recorded before connecting silently blocks the publish that follows a successful connect. Severity: 6/10

Existing Risk: 6/10 - An early transient error followed by a successful connect leaves the session with no core record and no connect hook, so the tab shows no agent even though the process is running; post-connect errors can also fire repeatedly.

Proposal Risk: 2/10 - An explicit state makes each transition total, but the hooks still have side effects, so a transition that fires twice would still be visible.

Proposal: `src/acp/session-manager.ts` `AcpSessionManager.session()` declares `connecting`, `connected` and a write-once `failure`; `publish()` returns early when `failure !== undefined`, `onError` records it without clearing it, and the post-connect branch calls `hooks.onError(failure)` whenever one was recorded, even when `connected` is true. Replace the three flags with one state such as `'connecting' | 'connected' | 'failed'`, move the "record now versus call the hook now" decision into a single `onError` transition, and let `publish` refuse only in the failed state after the connection has settled. `AcpManager.acquire` in `src/acp/manager.ts` is the hook consumer that settles the prompt and closes the tab, so keep exactly one error delivery. There is no `session-manager.test.ts`; indirect coverage lives in `src/acp/record-feed.test.ts` and `src/acp/manager.test.ts`; add a colocated test for early-error-then-connect and for two post-connect errors asserting one publish and one settle.


* Emit the ACP tool loop's terminal event when a native command throws so the prompt settles and state refreshes.

Existing Debt: The tool loop's error path ends the run without its finished event, so the cleanup that only the terminal handler performs is skipped. Severity: 6/10

Existing Risk: 6/10 - A command that rejects leaves the prompt unsettled with no state-change notification and no dirty broadcast, so the transcript keeps looking busy and the connection row never updates.

Proposal Risk: 2/10 - Both paths end with a terminal event, but the handler still distinguishes outcomes by the event reason, so a wrong reason changes row state.

Proposal: `src/acp/loop.ts` `runAcpToolLoop` catches a throwing or rejecting `dependencies.runCommand`, calls `h.error(errorText(error))` and returns, while the normal end emits `h.finished(command ? 'capped' : 'answered', maxSteps)`. The `finished` handler in `src/acp/run-prompt.ts` performs the state-change notification, rate-limit check, dirty broadcast and `answered: true` settle that the error handler does not. Emit a terminal event on the catch path too, with a reason that conveys failure, and have the `run-prompt.ts` handler map that reason to the same cleanup while preserving the error line. `src/acp/loop.test.ts` covers `session.onError` but not a throwing command, and `src/acp/drive-loop.test.ts` asserts only the error line for a rejecting host; add an assertion there that a terminal event follows and the prompt settles.


* Report a failed cleanup of the OAuth staging file instead of leaving a second plaintext credential on disk.

Existing Debt: The OAuth seeding step silently ignores a failure to remove its temporary file, so a successful result can leave a duplicate copy of the credential behind. Severity: 6/10

Existing Risk: 7/10 - A stale `.auth-seed` holding the full OAuth token remains in the sandbox data home, outliving the linked auth file and invisible to the caller that reported the preparation available.

Proposal Risk: 2/10 - The failure surfaces as a preparation failure, but the link has already been made by then, so cleanup must also remove that link to leave no copy at all.

Proposal: `src/sandbox/opencode-data.ts` `writeOauth` creates `<dataHome>/opencode/.auth-seed` with mode 0o600, hard-links it to `auth.json`, then runs `try { unlinkSync(staging); } catch { return; }`, swallowing the error and returning success. Remove the silent catch so the failure propagates to `prepareOpencodeData`, which already maps storage errors to `{ type: 'failed', reason: 'storage' }`, and remove the linked file when the staging removal fails so no duplicate remains. `src/sandbox/opencode-data-failures.test.ts` forces a partial write failure and checks the staging file is gone, and `src/sandbox/opencode-data.test.ts` checks the seeded auth file and its mode but not staging after a successful link; add a case that makes `unlinkSync` throw and asserts a storage-failure result with no lingering credential file.


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

## declined
