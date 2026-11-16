<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the pull request description's claim that the new web-search feature directory knows nothing about tabs or the remote channel, which the new tab adapter contradicts.

Existing Issue: The description says the new `src/web-search/` feature directory "knows nothing about tabs, ACP, or the remote channel", while this commit adds `src/web-search/tab-search.ts`, which imports `Managers`, `localReadRoot`, `withRemoteTabPort`, and `notify` and chooses between a local search and the tab's remote port. Severity: 2/10

Existing Risk: 2/10 - A reviewer uses the description's boundary claim to judge the directory and misses that one module already carries host and remote dependencies, so a later refactor can move that logic into `search.ts` without noticing the boundary.

Proposal Risk: 1/10 - The description states the intended boundary, but the tab adapter still lives in the directory; that is the plan's design, now visible.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "correct the description's claim that the web-search directory is host-free". Rewrite the sentence in the pull request body that introduces `src/web-search/` so it says the search core there stays free of tabs, ACP, and the remote channel while one small tab-adapter module chooses the local or remote side and posts the local disabled-provider notification. Match the plan's own design decision: `src/web-search/search.ts` is host-free and `src/web-search/tab-search.ts` is the only module in the directory that knows about tabs. Change no source, test, spec, or plan file for this wording fix.

