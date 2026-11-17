<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

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
