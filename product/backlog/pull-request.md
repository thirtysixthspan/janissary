<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Share the disabled-provider and refusal logic between search and fetch attempt resolution, removing duplication the pull request introduces.

Existing Issue: `src/web/providers/fetch-resolution.ts` copies the all-disabled block (filter enabled, map to stored reasons with an `Unknown failure` fallback, `formatFailures`) and the explicit disabled and not-configured branches from `src/web/providers/search-resolution.ts`, and imports the shared `AttemptResolution` and `DisabledReason` types from that search-specific module. Severity: 3/10

Existing Risk: 3/10 - A later change to how disabled or unconfigured providers are reported lands in one resolver and not the other, so `web search` and `web fetch` drift apart on the same provider state with no test comparing them.

Proposal Risk: 1/10 - One helper owns the shared rules, and the remaining risk is a wording slip in a heading, which the byte-for-byte line tests in both resolution suites would catch.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2049 "share disabled-provider and refusal logic between search and fetch resolution". Add a neutral `src/web/providers/resolution.ts` that owns the `AttemptResolution` and `DisabledReason` types and two small helpers: one that, given eligible manifests, a disabled-reason lookup, and the command's `FailureHeadings` from `src/web/providers/failure-lines.ts`, returns either the enabled attempts or the formatted stored-failure line; and one that returns the single-provider disabled line for an explicit request. Use both from `autoAttempts` and `explicitAttempts` in `search-resolution.ts` and from `autoFetchAttempts` and `explicitFetchAttempts` in `fetch-resolution.ts`, keeping each module's own unknown, not-configured, no-provider, and unsupported-format lines and their order. Repoint the type imports in `fetch-resolution.ts` and `src/web/providers/registry.ts` to the new module. `search-resolution.test.ts`, `fetch-resolution.test.ts`, and `registry.test.ts` pin every output line and must pass unchanged; add a short `resolution.test.ts` for the helpers.


* Extract one local-or-remote runner for the web tab adapters, removing the line-for-line copy the fetch adapter adds beside the search adapter.

Existing Issue: `fetchWebInTab` and `fetchRemote` in `src/web/fetch/tab-fetch.ts` duplicate `searchWebInTab` and `searchRemote` in `src/web/search/tab-search.ts`, differing only in the parser, remote operation name, port method, and core function, so the local-versus-remote routing, the remote error handling, and the local dependency wiring now live in two copies. Severity: 3/10

Existing Risk: 3/10 - A later fix to remote routing, such as forwarding the abort signal to the port or changing how a remote error is rendered, lands in one adapter only, and the end-of-work duplication check may also flag the pair.

Proposal Risk: 1/10 - Both subcommands route through one function, and what remains is the per-subcommand parser and core, each still covered by its own adapter tests.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2049 "extract one local-or-remote runner for the web tab adapters". Add a generic helper in `src/web/`, for example `src/web/tab-run.ts` exporting `runWebSubcommandInTab(managers, label, input, signal, spec)`, where `spec` carries the parse function, the remote operation name passed to `withRemoteTabPort` from `src/file-read/remote-tab-port.ts`, the port call, and the local core. It parses, returns the usage error unchanged, chooses the side with `localReadRoot` from `src/file-read/tab-read.ts`, runs the remote call through `withRemoteTabPort` with the existing `errorText` catch, and otherwise calls the core with `getProjectTokens()`, `globalThis.fetch`, the signal, and `reportProviderDisabled(managers, label)` from `src/web/disabled-notice.ts`. Reduce `searchWebInTab` and `fetchWebInTab` to one call each with their spec, keeping their exported names and signatures so `src/web/tab-web.ts` is unchanged. `src/web/search/tab-search.test.ts`, `src/web/fetch/tab-fetch.test.ts`, and `src/web/tab-web.test.ts` cover local, remote, unavailable, and notification behavior and must pass unchanged.


* Bring the web provider developer documentation up to date with fetch, so its token-row checklist names the new web fetch spec and its search-only wording covers both commands.

Existing Issue: The "Adding a row" checklist in `documentation/developer-documentation/web-search-providers.md` lists the specs that enumerate the token files but omits the new `product/specs/web-fetch.md`, which lists them in its Tokens section, and several passages still describe only search: the key paragraph, the `signal` row of the capability table, the remote `reportDisabled` sentence, and the `product/specs/workspaced-agent.md` sentence that says "The search runs in the Janissary process". Severity: 3/10

Existing Risk: 3/10 - The next contributor who adds a provider token follows the checklist and leaves `product/specs/web-fetch.md` stale, and a provider author reads that `signal` and `reportDisabled` apply only to search.

Proposal Risk: 1/10 - The checklist and the capability descriptions match the code, and what remains is the page's search-flavoured title, which is cosmetic.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2049 "update the web provider developer doc and workspaced-agent spec for fetch". In `documentation/developer-documentation/web-search-providers.md`, add `product/specs/web-fetch.md` to the list of specs in the "Adding a row" paragraph; reword the key paragraph so a provider's key is read by the Janissary process that runs the search or fetch; change the `signal` row of the capability table to say it is aborted when the caller cancels the search or fetch and is absent for a typed command; and extend the remote `reportDisabled` sentence to say a search or fetch on a remote machine passes none, matching `webFetch(args, { tokens, fetch })` in `src/remote/filesystem/web-fetch-operation.ts`. In `product/specs/workspaced-agent.md`, change "The search runs in the Janissary process" to name both `web search` and `web fetch`. Check each edited sentence against `src/web/providers/contract.ts`, `src/web/fetch/tab-fetch.ts`, and `src/commands/web.ts`. No code or tests change.


* Repoint the technical-debt backlog entries that still name the `src/web-search/` paths this pull request removed, so the documentation matches the renamed tree.

Existing Issue: Two entries in `product/backlog/technical-debt.md` still cite `src/web-search/tab-search.ts`, `src/web-search/command.ts`, `src/web-search/command.test.ts`, and the `WEB_FLAGS` completion list, none of which exist after the rename to `src/web/`, and the shared-flag-grammar entry does not count the `web fetch` grammar this pull request adds. Severity: 2/10

Existing Risk: 3/10 - An agent working either backlog item edits or creates files at paths that no longer exist, or unifies the flag grammars while missing `web fetch`.

Proposal Risk: 1/10 - The entries name real files and the full set of grammars, and the residual risk is ordinary drift from later renames.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2049 "repoint technical-debt backlog entries from src/web-search to src/web". In `product/backlog/technical-debt.md`, in the entry about moving the shared file-operation substrates into `src/file-operations/`, replace both `src/web-search/tab-search.ts` mentions with `src/web/search/tab-search.ts` and add `src/web/fetch/tab-fetch.ts` as a further importer of `remote-tab-port.js` and the `tab-read.js` helpers. In the entry proposing a shared `CommandSpec` parser, replace `src/web-search/command.ts` and `src/web-search/command.test.ts` with `src/web/search/command.ts` and `src/web/search/command.test.ts`, add `src/web/fetch/command.ts` (`parseWebFetch`, `WEB_FETCH_USAGE`) and its test to the scope, note that `src/web/flag-scan.ts` (`scanFlagArguments`) is now the shared web scan loop, and replace `WEB_FLAGS` with the current `SEARCH_FLAGS`, `FETCH_FLAGS`, and `FORMAT_VALUES` names from `src/completion/web.ts`. Verify each name with `grep` before writing it. Change only the paths and names in those entries, leaving their scores and the rest of the file untouched.
