<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Keep a chart on screen when a refresh fails, which is what the spec and the pull request description both promise and what the shipped region order takes away.

Existing Issue: The body's four regions are chosen in order, and a recorded error is checked before the chart, so a re-read that fails replaces a working chart with a failure screen, while `product/specs/visualizations.md` and the pull request description both state that a source which stops answering does not take the chart off the screen. Severity: 6/10

Existing Risk: 6/10 - The first time a poll hits a flaky endpoint the user loses the chart they were reading, which is the moment the feature is most worth having, and the only recovery is to re-read successfully or start over from the source.

Proposal Risk: 2/10 - The failure and the chart would share a region, so a failed re-read still costs the vertical space the chart had, but the marks stay and the reason reads as an annotation rather than as a replacement.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1440: keep the chart on screen when a refresh fails". In `web/src/plugins/visualizations/VisualizationBody.tsx`, split the recorded `error` out of the region dispatch: a window that has a `chart` and a `table` should render `Drawn` regardless of `error`, and the reason should render inside it — as a line above the figure, using the existing `.visualization-reason-text` styling — with the source-replacement and ask-again controls still reachable. Only a window with no `table` should fall through to the full `Reason` region, because that is the case where there is nothing to keep on screen. Pass the reason down to `Drawn` as an optional prop rather than reading it from a second source, and give the caption line the same treatment so the read time and the failure read as one block of metadata. Add cases to `web/src/plugins/visualizations/VisualizationTab.test.tsx`: a window carrying both a chart and an `error` must still render `svg.visualization-chart` and must also render the error text, and a window carrying an `error` and no `table` must still render the reason region. `web/src/plugins/visualizations/visualizations-style.test.ts` asserts on the existing class names and is unaffected. No server change is needed: the manager already keeps the previous table on a failed re-read, which is the half that is correct today.


* Deliver the interviewer test the completed plan names, since the state machine it covers is the riskiest logic in the diff and has no test of its own.

Existing Issue: The plan's Tests section specifies `src/visualizations/interview.test.ts` covering the opening call, the closing call, a refused second call, cancellation, a rate-limited failure, and a modification, and no such file exists, so the module that routes a model's reply into a stored chart, a stored reply, or a recorded error is exercised only indirectly through the manager. Severity: 6/10

Existing Risk: 6/10 - Every path that decides what a model is allowed to change is untested, so a regression that stores a chart naming a column the data lacks, or that loses an in-flight turn, would reach a user rather than a failing test.

Proposal Risk: 3/10 - The tests would pin the routing, but they would pin it against a stubbed session, so a real model's shape still varies.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1440: add the interviewer test the plan specifies". Add `src/visualizations/interview.test.ts`, driving `VisualizationInterviewer` directly with a stubbed `AcpSessionPool` and a fake `commit`, in the shape `src/visualizations/manager.test.ts` already uses for its injected collaborators. Cover, in the order the plan lists them: an `open` call whose parsed reply carries questions sets them on the record and commits with no error; a `close` call whose reply carries a valid chart stores it and, when the record is still untitled, takes the chart's title; a chart naming a column the table lacks is not stored and commits with the refusal reason instead; a reply that parses as no chart commits with the unreadable reason; a second call while one is in flight is refused for each of `open`, `close`, and `revise`; `cancel` drops the in-flight entry, returns false when nothing is in flight, and does not commit a partial; an `onError` from the session commits a rate-limited reason through `isRateLimitError` and closes the session; a `revise` pushes a streaming turn before the call and replaces it with the parsed note on completion, keeping the turn on the record; and `dispose` clears the in-flight set and disposes the pool. The plan's wording that chunks "coalesce into bounded ticks" describes behavior the implementation deliberately dropped — a partial JSON reply is not renderable, and `interview.ts` says so — so record the accumulator as it is rather than testing for a tick that does not exist.


* Correct the completed plan, which describes four modules and a streaming behavior the shipped code does not have.

Existing Issue: The plan states the domain "holds six modules", names a client set of `BarChart`/`LineChart`/`ScatterChart`/`PieChart` plus `export/raster.ts` and `export/deflate.ts`, places the domain calculation in the scale module, and specifies that chunks "coalesce into bounded ticks" — where the shipped code has ten modules after three extractions the 200-line limit required, one `CartesianChart` covering four kinds, `export/download.ts`, the extent in the points module, and no tick at all because a partial JSON reply is not renderable. Severity: 4/10

Existing Risk: 4/10 - The plan ships as the record of why this code looks the way it does, so the three extractions that exist only to satisfy the file-size rule look unmotivated and the removed tick looks like an oversight rather than a decision.

Proposal Risk: 1/10 - Prose only; the code and its tests are unaffected.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1440: correct the completed plan to match the shipped code". Edit `product/plans/complete/visualizations-tab.md` so it describes what shipped, and change nothing else. In the "Checkpoint 3" section, replace "holds six modules" with the ten that exist — `source.ts`, `fetch.ts`, `table.ts`, `ingest.ts`, `chart-spec.ts`, `prompts.ts`, `interview.ts`, `refresh.ts`, `store.ts`, `manager.ts` — and add a short sentence for the three the plan did not name, saying why each exists: `ingest.ts` because the format decision belongs apart from the manager that calls it, `refresh.ts` because one timer serving every visualization is its own concern and the manager's file was over the limit without it, and `index.ts` because which records are known and which have a tab open is what bounds the payload and deserves its own testable module. In the same section, state that the domain calculation lives in `chart/points.ts` rather than the scale module. In the "Checkpoint 5" section, replace the per-kind component list with the four files that shipped — `chart/Axes.tsx`, `chart/CartesianChart.tsx`, `chart/PieChart.tsx`, `chart/ChartSvg.tsx` — and say in one sentence that bar, line, area, and scatter share a frame and differ only in the mark emitted, and replace `export/raster.ts` and `export/deflate.ts` with `export/download.ts`, which holds both the rasterizing and the browser wiring so the writer beside it stays free of browser APIs. In the Tests section, drop the "chunks coalesce into bounded ticks" clause from the interviewer line and say instead that a partial reply is not rendered because it is half a JSON object. Finally, amend the one sentence describing the client plugin's import boundary, which currently reads as though a plugin may reach `web/src/shared/`: it may not, so the sentence should say the stick-to-bottom hook is published through `web/src/plugins/api.ts` alongside the command bar, the selection hooks, and the dialog, exactly as those are.


* Remove the export no consumer reads, which exists only to publish the read bounds nothing calls.

Existing Issue: `src/visualizations/fetch.ts` exports `SOURCE_LIMITS`, and a repository-wide search finds no other reference, so a named constant pair reads as a contract for callers that does not exist. Severity: 2/10

Existing Risk: 2/10 - Harmless on its own, but it invites a later change to the bounds through a surface that has no test and no caller, which is how the two numbers stop matching what the module actually enforces.

Proposal Risk: 1/10 - The constants stay, only the unused export goes.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1440: drop the unused SOURCE_LIMITS export". Delete the `SOURCE_LIMITS` export from `src/visualizations/fetch.ts` and leave `TIMEOUT_MS`, `MAX_BYTES`, and `MAX_REDIRECTS` as the module-private constants they already are, since each is already used at its own use site and the comment above them explains why they exist. If a test wants to assert a bound, `src/visualizations/fetch.test.ts` already passes an explicit `maxBytes` and `timeoutMs` through `ReadOptions`, so the constants themselves are not what that test depends on — confirm that before removing the export, and add a case pinning the defaults against a body just under and just over the real cap only if the existing cap test does not already cover the boundary. No other file changes; `knip` will confirm the export has no consumer.


* Drop the test that asserts an export is a function, and the export it forced, since neither checks anything.

Existing Issue: `web/src/plugins/visualizations/visualizations-style.test.ts` imports `withResolvedColours` purely to assert `typeof ... === 'function'`, and that function is exported from `web/src/plugins/visualizations/export/download.ts` for no production reason, so one test block and one widened module surface exist to say nothing about behaviour. Severity: 3/10

Existing Risk: 3/10 - A test that cannot fail for a real reason is a green mark standing in for a check, and the wider export invites a caller that depends on the internal shape of a serialization step.

Proposal Risk: 1/10 - The colour assertions that share the file are unaffected.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1440: drop the export that exists only for a test that asserts nothing". Remove the final `describe` block from `web/src/plugins/visualizations/visualizations-style.test.ts` and make `withResolvedColours` module-private again in `web/src/plugins/visualizations/export/download.ts`. Then replace the coverage that block was standing in for with one that can fail for a real reason: assert that the property list `withResolvedColours` reads — `--bg`, `--bg-soft`, `--fg`, `--muted`, `--faint`, `--border`, `--accent`, `--running`, `--success`, `--error` — is exactly the set of custom properties the chart stylesheet paints with, which is the pairing that decides whether an exported chart looks like the one on screen. Extract that list into a named constant in `download.ts` and derive the stylesheet assertion from it, so the two can no longer drift apart, and keep the constant unexported. This needs no DOM: it is a comparison of two lists, not a call into the function.


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

