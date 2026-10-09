<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Enforce the summarizer's promised tool-less security boundary.

Existing Issue: The launcher calls the ordinary core ACP prompt path, which installs and executes browser, question, and database tools despite the plan and spec claiming that the summarizer cannot act. Severity: 9/10

Existing Risk: 8/10 - An injected or mistaken model reply can execute host tools, including database commands, from an automatic background summary.

Proposal Risk: 2/10 - An explicitly enforced empty tool set prevents model replies from invoking host tools, with regression tests exposing any accidental grant.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1627 "enforce the summarizer's promised tool-less security boundary". Add an additive, tab-scoped way to request tool-less ACP operation through src/plugins/api.ts and src/plugins/acp-capabilities.ts, and enforce it in src/acp/manager.ts before creating the tool primer, extractor, and runner from src/acp/tool-table.ts. Opt the launcher into that mode in src/plugins/launcher/manifest.ts and src/plugins/launcher/summarizer.ts; preserve ordinary ACP callers' existing tools. Add a host-level test whose summary reply contains a recognized browser, question, or database command and prove that none executes, while existing ACP tool-loop tests still cover interactive operation. Update product/specs/launcher.md and documentation/developer-documentation/tab-plugins.md to describe the enforced contract.


* Frame all model-fed tab text as untrusted data to close the prompt-injection gap.

Existing Issue: describeTab delimits only the transcript tail while interpolating a tab's title and last command directly into the instruction-bearing part of the prompt. Severity: 7/10

Existing Risk: 7/10 - A command or title containing instruction-like text can steer the summarizer outside the boundary the trust framing tells it to respect.

Proposal Risk: 2/10 - Keeping externally supplied strings inside unpredictable data markers contains this route, although model adherence still requires defense in depth.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1627 "frame all model-fed tab text as untrusted data to close the prompt-injection gap". In src/plugins/launcher/summarizer.ts, place titles, command lines, and any other externally supplied textual metadata inside the same untrusted-data framing as transcript tails, keeping only validated routing identity and fixed host facts outside. Generate the delimiter with a cryptographically strong random source rather than Math.random, and retain explicit priming that the framed values are data. Extend src/plugins/launcher/summarizer.test.ts with multiline titles and commands that attempt to override reply instructions, asserting that every such string lies inside the markers; update product/specs/launcher.md to avoid claiming framing makes injection impossible.


* Deliver the plan's transcript-backed status summaries by requesting capped tails.

Existing Issue: The summarize intent obtains its rows from ownTabs, which calls tabActivity without a tail limit, so every real prompt substitutes 'No transcript content yet.' for the promised output slice. Severity: 8/10

Existing Risk: 7/10 - Users receive summaries inferred only from metadata even when tabs hold the output needed to explain their work.

Proposal Risk: 2/10 - Explicit tail requests and integration coverage keep output available to summarization without placing raw transcripts in the row payload.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1627 "deliver the plan's transcript-backed status summaries by requesting capped tails". In src/plugins/launcher/activate.ts, separate display-only activity reads from summarizer reads and pass a bounded positive entry limit to tabActivity for each flush. Feed only eligible center tabs into src/plugins/launcher/summarizer.ts, and include the promised recency fact in describeTab. Preserve the tail stripping in src/plugins/launcher/payload.ts. Extend src/plugins/launcher/activate.test.ts with a capability fake that omits tails unless requested, and assert actual transcript text reaches the prompt while published LauncherPayload rows contain none; src/plugins/activity.test.ts already covers optional tail behavior and caps.


* Detect transcript edits and capped-log appends when deciding whether to refresh a summary.

Existing Issue: The summarizer cursor compares only logLength, so output rewritten into a running entry and new entries appended after the log reaches its cap are treated as unchanged. Severity: 7/10

Existing Risk: 7/10 - A working tab can retain its initial summary indefinitely even as its output and eventual result change.

Proposal Risk: 2/10 - A host-issued content revision distinguishes real transcript changes while preserving the idle no-prompt behavior.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1627 "detect transcript edits and capped-log appends when deciding whether to refresh a summary". Add a monotonic transcript revision owned by TabRuntime in src/tab/types.ts and advance it on real transcript writes in src/tab/transcript/events.ts, including append, update, clear, and capped replacement. Carry it through the pull activity contract in src/plugins/activity.ts and src/plugins/api.ts, and use it with tab identity for the fed cursor in src/plugins/launcher/summarizer.ts; keep it out of display-row fingerprints so streaming does not force payload republishes. Add tests for in-place output growth, completed output, a full capped log receiving another entry, and unchanged idle state in src/plugins/launcher/summarizer.test.ts and colocated transcript tests.


* Keep existing summaries for live tabs omitted from a later reply.

Existing Issue: The summarize intent replaces state.summaries with the latest reply map even though prompts include only changed tabs and the plan promises omitted tabs keep their previous paragraphs. Severity: 6/10

Existing Risk: 6/10 - Updating one tab erases the useful summaries of other tabs that have not changed.

Proposal Risk: 2/10 - Merging validated reply entries into a live-tab-filtered map preserves unaffected summaries while allowing closed entries to be removed.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1627 "keep existing summaries for live tabs omitted from a later reply". In src/plugins/launcher/activate.ts, retain previous summaries for still-live tab identities, overlay only matching paragraphs returned by src/plugins/launcher/summarizer.ts, and remove entries for closed tabs even when the reply is empty. Extend src/plugins/launcher/activate.test.ts to summarize two tabs, advance only one, and confirm the other's paragraph survives; also test a partial reply and a close with no new transcript activity. The existing publish test covers a first paragraph but does not cover preservation across partial replies.


* Reset launcher summary state on tab recreation and reject replies from obsolete tab incarnations.

Existing Issue: Launcher state and priming survive ordinary tab closure because dispose runs only on plugin shutdown or disablement, and replies are filtered against the pre-await live snapshot rather than current tab identities. Severity: 7/10

Existing Risk: 7/10 - A reopened launcher can reuse stale priming and summaries, and a late reply can describe a newly recycled label using a closed tab's output.

Proposal Risk: 2/10 - Per-incarnation identity checks discard obsolete work while allowing current summaries to continue normally.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1627 "reset launcher summary state on tab recreation and reject replies from obsolete tab incarnations". In src/plugins/launcher/activate.ts, reset launcher and summarizer state when the singleton's creation factory actually runs, and use a generation token to reject work started by a previous launcher incarnation. Extend the host activity contract in src/plugins/activity.ts to expose a stable identity for each tab incarnation, then re-read live activity after awaited prompts before accepting summaries or cursors. Prune disappeared identities on topic delivery and exclude reused labels from old summaries. Add close-and-reopen and deferred-reply tests using the real TabPluginHost and TabManager lifecycle; the existing activation test calls dispose manually and therefore misses ordinary closure.


* Recover summary priming and cursors after core ACP returns an error or restarts.

Existing Issue: The summarizer treats resolved ACP error strings as successful replies, advances every cursor, and keeps primed true even when the core session has been closed and replaced. Severity: 6/10

Existing Risk: 6/10 - A transient ACP failure can permanently suppress a tab's summary until its transcript length changes, and a replacement session receives no persona or trust framing.

Proposal Risk: 2/10 - Structured session identity and failure results make retries explicit while preserving successful-session priming.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1627 "recover summary priming and cursors after core acp returns an error or restarts". Expose a structured success or failure result and a session identity through an additive plugin ACP surface in src/plugins/api.ts, src/plugins/acp-capabilities.ts, and src/acp/manager.ts rather than guessing from model text. In src/plugins/launcher/summarizer.ts, advance cursors only after a successful usable summary response, and re-prime with a new delimiter when session identity changes. Add tests for a prompt error returned as a resolved core response, a connection close between flushes, an empty or malformed reply, and retry without further tab output. Preserve the existing ordinary ACP string API for callers that depend on it.


* Publish edited launcher configuration when the existing singleton is reopened.

Existing Issue: readCommands changes module state on every launcher invocation, but an existing tab skips its creation factory and republish compares only tab rows, leaving unchanged rows with the old visible command configuration. Severity: 6/10

Existing Risk: 6/10 - The user sees stale labels and commands after editing launcher.json, while server-side IDs may already resolve to different commands.

Proposal Risk: 2/10 - Publishing configuration changes explicitly keeps displayed entries and dispatched commands synchronized.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1627 "publish edited launcher configuration when the existing singleton is reopened". In src/plugins/launcher/activate.ts and src/plugins/launcher/payload.ts, include commands, source, filePath, and problem in the publication decision or explicitly update the existing singleton after re-reading configuration. Keep notification deduplication independent of row fingerprints. Extend src/plugins/launcher/activate.test.ts with a host fake that skips the factory for an existing instance, edit a command and its label without changing tabs, invoke launcher again, and assert the visible payload and executed command agree. The current fake always runs the factory and hides this case.


* Route command-rail clicks through application interception and visible reply handling.

Existing Issue: Command-rail clicks use a fire-and-forget run-command intent, bypass client interception, and discard dispatch results, so the default Tasks and History rows are server no-ops and command errors never reach the visible reply area. Severity: 7/10

Existing Risk: 7/10 - Default launcher actions do nothing and failures are hidden even though typed commands in the same launcher have working interception and feedback.

Proposal Risk: 2/10 - One submission path lets both input surfaces use existing picker behavior and exposes dispatch failures to the user.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1627 "route command-rail clicks through application interception and visible reply handling". Unify command-row submission with the application interception and reply handling in web/src/plugins/launcher/LauncherTab.tsx and web/src/plugins/launcher/useLauncherSubmit.ts. Preserve server validation of configured IDs in src/plugins/launcher/activate.ts while returning the dispatch result to the client for non-intercepted rows; handle Configure failures through the same visible feedback. Add client tests that the default Tasks and History clicks open their pickers without a server dispatch, and that a failing or unclaimed configured command displays feedback. src/commands/tasks.ts and src/commands/hist.ts intentionally do nothing on the server.


* Navigate tab rows in their rendered tier order and wire selection focus and scrolling.

Existing Issue: TabList renders rows in tier order but selects and activates them by the original payload index, and both launcher lists attach the caller's ref instead of the ref useListSelection uses to focus and scroll. Severity: 6/10

Existing Risk: 6/10 - Arrow keys jump through the displayed list out of order, and clicking a row does not transfer keyboard focus or scroll later selections into view.

Proposal Risk: 2/10 - Selecting from the flattened rendered list and sharing the actual DOM ref aligns keyboard activation with visible highlights.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1627 "navigate tab rows in their rendered tier order and wire selection focus and scrolling". In web/src/plugins/launcher/TabList.tsx, flatten launcherTiers into the exact displayed row order and use it for selection indices, Enter activation, and row rendering. In that file and web/src/plugins/launcher/CommandRail.tsx, compose the external list ref with selection.listRef so the shared hook can focus and scroll the mounted list. Add interaction tests with payload order different from tier order, arrow traversal, Enter, clicking then pressing an arrow, and a selected row outside the viewport; current tier tests check grouping but no keyboard traversal across tiers.


* Advance displayed relative ages while the application is idle.

Existing Issue: Row ages are computed with Date.now only during render and no clock tick schedules a render when the row payload stays unchanged. Severity: 5/10

Existing Risk: 5/10 - A quiet tab can display 'now' or '1m' for hours even though the spec promises ages coarsen as time passes.

Proposal Risk: 2/10 - A visibility-scoped minute tick updates presentation time with no server broadcasts or ACP prompts.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1627 "advance displayed relative ages while the application is idle". Add a launcher-local clock hook under web/src/plugins/launcher/ that ticks at a suitable minute cadence only while the launcher is visible, pass its current time into LauncherTabRowView, and call relativeTime with that value. Clean up the interval when hidden or unmounted. Extend web/src/plugins/launcher/LauncherTab.test.tsx with fake timers and unchanged payloads across minute, hour, and day boundaries; retain the pure conversion coverage in time-ago.test.ts.


* Render a visible status dot for each launcher tab row.

Existing Issue: LauncherTabRowView renders an empty launcher-dot span whose CSS specifies color and animation but no content, dimensions, background, or pseudo-element. Severity: 5/10

Existing Risk: 5/10 - The promised colored busy indicator is invisible even though the DOM tests see the correct color attribute.

Proposal Risk: 1/10 - An actual glyph or sized shape makes the supplied color and busy animation visible, with a visual assertion guarding the styling.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1627 "render a visible status dot for each launcher tab row". In web/src/plugins/launcher/LauncherTabRowView.tsx and web/src/plugins/launcher/launcher.css, render the same visible dot shape used by existing tab chrome or a sized circle using currentColor, preserving the busy animation. Add a meaningful styling or browser assertion that the dot has visible content or nonzero painted dimensions; the existing color-only test in LauncherTab.test.tsx cannot detect an empty unpainted span.


* Exclude the launcher itself from every tab list and summarize only center tabs.

Existing Issue: notify projects all undocked tabs without excluding the launcher, while ownTabs identifies ownership by a literal label and includes other docked tabs in summary flushes. Severity: 6/10

Existing Risk: 6/10 - Undocking the launcher lists itself, a label collision defeats self-exclusion, and hidden docked tabs consume summary work outside the planned center-tab scope.

Proposal Risk: 2/10 - Using host-provided plugin ownership and center placement consistently prevents self-feeding and unwanted docked summaries.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1627 "exclude the launcher itself from every tab list and summarize only center tabs". Extend the activity contract in src/plugins/activity.ts with an appropriate host-owned plugin identity or scoped exclusion facility, and use it in src/plugins/launcher/activate.ts and src/plugins/launcher/payload.ts to exclude every launcher-owned tab on both pull and push paths. Filter summary inputs to center tabs, and do not assume LAUNCHER_LABEL equals the unique label the host minted. Add tests for an undocked launcher, another tab already named launcher, and non-launcher docked tabs; existing tests exclude only a docked literal launcher label.


* Reject duplicate launcher command IDs before they can dispatch a different row.

Existing Issue: commands-file accepts explicit IDs without checking uniqueness, while run-command resolves the first matching ID and React also keys rows by that ID. Severity: 6/10

Existing Risk: 6/10 - Two configured rows sharing an ID, including a collision with an automatically generated ID, can silently execute the first row's command.

Proposal Risk: 2/10 - Unique validated IDs make every visible row map to exactly one configured command.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1627 "reject duplicate launcher command ids before they can dispatch a different row". In src/plugins/launcher/commands-file.ts, ensure the resulting IDs are unique across explicit and generated IDs, reporting ambiguous configuration through the existing file-problem policy rather than keeping clickable duplicate rows. Keep src/plugins/launcher/activate.ts dispatch tied to the validated identity. Add commands-file tests for duplicate explicit IDs and explicit command-1 colliding with a generated ID, plus an activation test proving clicking the second row cannot run the first command. Document accepted ID behavior in product/specs/launcher.md.


* Show both a tab's alias and its label in the planned hover metadata.

Existing Issue: LauncherHoverCard displays row.title instead of row.label when an alias exists, so the label promised by the spec is absent. Severity: 3/10

Existing Risk: 3/10 - A user cannot identify the command-addressable label of an aliased tab from its hover card.

Proposal Risk: 1/10 - Displaying the label alongside a differing title makes the alias-to-label relationship visible without changing focus behavior.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1627 "show both a tab's alias and its label in the planned hover metadata". In web/src/plugins/launcher/LauncherTabRowView.tsx, render the display title and a separate label only when they differ, styling the secondary label in launcher.css. Extend the aliased-tab hover test in LauncherTab.test.tsx to assert both Release agent and agent appear in the tooltip; preserve existing cwd, host, last-command, and pointer-out coverage.


* Correct the description's claim that docking Notifications displaces the launcher.

Existing Issue: The PR's command example and verification instructions say notifications left displaces the launcher, while applyDock preserves different view kinds and the new spec additionally says that command docks right. Severity: 3/10

Existing Risk: 4/10 - Reviewers and future tests use contradictory placement expectations for a core launcher action.

Proposal Risk: 1/10 - Accurate examples make the existing shared-sidebar behavior explicit, with existing docking tests exposing any future behavior drift.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1627 "correct the description's claim that docking notifications displaces the launcher". Correct the PR body's command example and verification step to say notifications left joins the left sidebar alongside the launcher, selecting the feed through the normal sidebar mechanism. Correct the contradictory direction and displacement statements in product/specs/launcher.md and product/plans/complete/sidebar-launcher-tab.md. Use src/tab/dock.ts and src/tab/operations.test.ts as the behavior reference, and preserve the existing different-kind occupant rule rather than changing docking to match the prose.


* Keep the launcher shared contract import-free as required by the plugin architecture.

Existing Issue: The new launcher shared module imports isRecord from the server plugin API at runtime even though plugin shared contracts must import nothing. Severity: 5/10

Existing Risk: 5/10 - The browser contract depends on the server API module graph and its NodeNext imports, weakening isolation and making future API changes affect client loading.

Proposal Risk: 2/10 - A local import-free guard preserves the intended browser-safe contract boundary and can be pinned by a source-boundary test.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1627 "keep the launcher shared contract import-free as required by the plugin architecture". In src/plugins/launcher/shared.ts, define the small record predicate locally without any imports, and use the same predicate for empty-intent validation instead of maintaining a separate weaker check in src/plugins/launcher/activate.ts. Add shared guard tests for null, arrays, missing required fields, and all intent payloads, plus coverage enforcing that the shared contract has no imports. Preserve client lazy registration in web/src/plugins/registry.tsx and verify the launcher remains a separate production chunk when this finding is implemented.


* Repair the new review fixtures so they exercise the published types and real lifecycle contracts.

Existing Issue: The new tests contain incomplete activity objects, unsupported view values, missing required prompt arguments, and simplified fakes that bypass singleton creation and ordinary tab closure. Severity: 6/10

Existing Risk: 6/10 - The intended regression suite can fail before asserting behavior or pass while the host integration remains broken.

Proposal Risk: 2/10 - Typed faithful fixtures and focused integration cases expose contract mismatches without changing production behavior.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1627 "repair the new review fixtures so they exercise the published types and real lifecycle contracts". Repair src/plugins/launcher/summarizer.test.ts so its TabActivityEntry helper supplies dotColor and active, its view values match the contract, every buildSummarizerPrompt call supplies a delimiter, and the asserted marker text matches the actual description. Repair the moved-topic fixture in src/plugins/launcher/activate.test.ts to deliver TabActivityEntry objects rather than LauncherTabRow projections lacking logLength. Replace forced capability casts where they hide these mismatches and add host-backed singleton and close tests. Add the plan's currently absent regression assertions for janus init idempotent launcher-file seeding, timestamp writers in src/tab/transcript/events.ts, and tabs.focus on a missing label, using the existing project-init, transcript, and topic test files. Run the appropriate diff-scoped checks during the separate implementation task; this review has identified these issues by reading only.


* Make the shipped summarizer persona available in ordinary initialized projects.

Existing Issue: readPersonaBody reads only the target project's ai/personas/launcher/summarizer.md, while janus init creates an empty personas directory and never installs that new file. Severity: 7/10

Existing Risk: 7/10 - The launcher in a normal project repeatedly reports a missing-file error and cannot produce any status summaries even with ACP available.

Proposal Risk: 2/10 - A bundled default with an explicit project override makes first-run summarization work while preserving deliberate local customization.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1627 "make the shipped summarizer persona available in ordinary initialized projects". In src/plugins/launcher/persona.ts, resolve a shipped default persona from the installed application when the target project has no launcher persona, or seed that persona idempotently through src/project/init.ts without overwriting user edits. Ensure the persona is included in the published package and document the override rule in product/specs/launcher.md. Extend src/plugins/launcher/activate.test.ts with an initialized scratch project outside the repository's persona tree and confirm a flush reaches ACP; add project-init or persona tests for absence and custom overrides. Existing summarize tests use process.cwd(), which happens to contain the repository's new persona and hides the missing-file path.
