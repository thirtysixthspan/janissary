<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Give a modification turn something to read when the model returns a chart with no note.

Existing Issue: A revision whose reply parses stores the model's `note` on the turn, and the note is optional, so a model that answers with a bare chart object leaves the turn with an empty response, which renders as an empty bubble under the user's query. Severity: 3/10

Existing Risk: 4/10 - The common case of "just change it, do not explain" leaves a visible dead space in the tab every time, and reads as the model having failed to answer rather than as a chart that did change.

Proposal Risk: 1/10 - A derived summary names what changed, which is derived from data already in hand rather than invented.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1440: give a modification turn something to read when the model returns no note". In `src/visualizations/interview.ts`, where `applyChart` assigns the parsed note to the streaming turn, fall back to a sentence composed from the specification already in hand when the note is empty: name the kind, the x and y columns, and the series column when one is set — for example `Now a line chart of revenue by month, split by region.` Build that string in a small pure helper in the same module and keep it a helper rather than a template inside the branch, so it is testable without a session. Apply the same fallback to the closing call's chart, which currently records nothing at all, by storing it as the last turn's response there too, or by leaving the closing call alone if the chart title already names the tab — decide which and say why in the module comment. Add cases to `src/visualizations/interview.test.ts` for a revision whose reply carries a chart and no note, asserting the derived sentence, and for one whose reply carries a chart and a note, asserting the model's own words still win.


* Bound the local files a data source may name, and say in the spec what reading one exposes.

Existing Issue: A source line beginning with `/`, `~`, or `.` is read with `readFileSync` after a size check and nothing else, so any path the process can read is reachable from a plugin intent, and what it returns is parsed and then put into the tab payload and persisted in the record — unlike the served files, which go through the `/open/` allow-list, and unlike a source that is merely opened for viewing. Severity: 6/10

Existing Risk: 6/10 - A path that names a credential or a key file has its contents parsed, broadcast to every connected client, written to the record, and sent to a third-party model as a sample, and the pull request describes the read only as bounded by size, timeout, and redirects.

Proposal Risk: 3/10 - Restricting the readable root to what the user already trusts closes the obvious paths, but any bound is a decision about what a local single-user tool may read, and that decision deserves to be stated rather than assumed.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1440: bound the local files a data source may name, and document what reading one exposes". In `src/visualizations/source.ts`, add a containment check for a file source so that the readable root is explicit rather than wherever the path points: resolve `~` and relative segments to an absolute path with `path.resolve` against the project directory the manager already holds, and accept the file only when it is inside that project directory or inside the user's home data directory, refusing anything else with a reason naming the directory it would have had to be under. Mirror the check in `src/visualizations/fetch.ts` so the read cannot be reached by another route, and cover both branches in `src/visualizations/source.test.ts` and `src/visualizations/fetch.test.ts` with paths that resolve outside each root, including a `..` traversal and an absolute path into a system directory. Then state the consequence in the spec rather than only the bound: add to `product/specs/visualizations.md`'s source section that a local file is read, parsed, kept in the saved record, and included in the sample sent to the model, so a source that names a credential file exposes it to whichever model pair is selected. Keep the URL path unchanged — the security review's note is about the filesystem, and the scheme, timeout, redirect, and no-credentials bounds on a URL read are already correct. If a bound turns out to reject a legitimate common case, the honest resolution is a configuration setting consulted from `src/config.ts`, and that decision belongs in this change rather than deferred.

