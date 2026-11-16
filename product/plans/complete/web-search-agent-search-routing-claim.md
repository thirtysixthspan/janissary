# Correct the specs' routing rule for an agent's web search

**Complexity: 1/10** — two spec sentences corrected across two spec files, no production files or test scenarios (p=2.35).

## Goal

`product/specs/web-search.md` and `product/specs/acp.md` must state where a granted agent search runs the way `searchWebInTab` routes it: by the tab the session belongs to, not by which host runs the ACP loop. A local tab searches on the machine running Janissary; a remote tab searches on that tab's remote host, in that workspace, with that workspace's merged tokens; a local-fallback session on a remote tab still goes to the remote host and prints `Remote connection unavailable.` when the tab has no ready channel; a remote-hosted loop searches on the far side directly.

## Issue

Recorded on PR #2010's branch backlog, severity 2/10:

> Correct the specs' claim, added by this subplan, that an agent's web search always runs on the host running the ACP loop.

The Agent tool paragraph in `product/specs/web-search.md` says:

> The search runs on the host running the ACP loop: the machine running Janissary for a local session, and the remote machine for a remote-hosted run, with that workspace's merged tokens.

The closing paragraph of the Web search subsection in `product/specs/acp.md` says:

> A granted step is a workspace step: the routing described above applies, so a `web` line reaches the same search as the typed command on the host running the loop.

Both make the loop's host the deciding fact. It is not: the loop always calls the tab's search route, and that route decides from the tab's remote field. A local-fallback session on a remote tab — `AcpSessionManager` running the loop locally because the remote ACP session could not start — therefore searches on the remote machine, not on the machine running Janissary.

Verified against the code:

- `src/acp/run-prompt.ts` (`runCorePrompt`, `runWorkspace`) sends every `isWebCommandLine` step to `searchWebInTab(managers, label, command, request.abort.signal)`. The session object does not enter the decision.
- `src/web-search/tab-search.ts` (`searchWebInTab`) asks `localReadRoot` for the tab's local root. When it gets one, it calls `webSearch` locally with `getProjectTokens()` and posts the disabled-provider notification. When it gets `undefined`, it calls `searchRemote`, which runs `port.webSearch(parsed)` through `withRemoteTabPort`.
- `src/file-read/tab-read.ts` (`localReadRoot`) returns `undefined` for any tab whose `remote` is set, so every remote tab — including one hosting a local-fallback session — takes the remote route.
- `src/file-read/remote-tab-port.ts` (`withRemoteTabPort`) returns `Remote connection unavailable.` when the tab has no channel, the channel is not ready, or the workspace is not prepared.
- `src/remote/serve-acp-loop.ts` (`startRemoteLoop`) routes a far-side `web` line to its private `searchWorkspaceCommand`, which calls `webSearch` with the loop's `tokens` — the workspace's merged tokens — and no `reportDisabled`.
- `src/acp/run-prompt.test.ts`'s `routes a local fallback session on a remote tab through the tab search` pins that the loop calls `searchWebInTab` for a remote tab and never `readFileInTab`. `src/web-search/tab-search.test.ts`'s `searches on the remote machine for a remote tab` and `returns the unavailable line without a local fallback` pin the route split, and `src/remote/serve-acp-loop.test.ts`'s `runs a web line with the workspace tokens and the run signal` pins the far-side tokens.

`product/specs/acp.md`'s Autonomous tool loop paragraph already states the local-fallback case correctly: "A `web` line likewise goes to the same search as the typed command on the host running the loop: locally through the tab, so a local fallback session on a remote tab searches on the remote machine, and on the far side with that workspace's merged tokens and no notification." The Web search subsection's closing sentence contradicts it by reducing the rule to the loop's host.

## Approach

1. In `product/specs/web-search.md`'s Agent tool section, replace only the sentence beginning "The search runs on the host running the ACP loop" with the tab-based routing rule, leaving every other sentence in the paragraph byte-for-byte unchanged.
2. In `product/specs/acp.md`'s Web search subsection, reword the closing paragraph's first sentence to say the step follows the workspace routing described above and searches on the side that owns the tab, leaving the existing local-fallback sentence in the Autonomous tool loop paragraph as the detailed statement.
3. Re-read both edited sentences beside `src/web-search/tab-search.ts`, `src/file-read/tab-read.ts`, `src/file-read/remote-tab-port.ts`, and `src/remote/serve-acp-loop.ts`.
4. Search the tree for the old phrasing to confirm no spec still claims an agent's search always runs on the loop's host.

## Design decisions

- **Route by tab, not by loop host.** The wrong claim treats the session host as the deciding fact. The code decides from the tab's `remote` field, so the corrected wording names the side that owns the tab and treats the loop's host as irrelevant to the choice except on the far side, where the loop runs in the tab's own workspace.
- **Keep the corner case explicit.** A local-fallback session on a remote tab is the case the old wording got wrong, and it is the case someone debugging a failed search will hit. The corrected sentence names it and the `Remote connection unavailable.` line, so a reader looks on the remote host and at that workspace's tokens.
- **Keep each file's detail level.** `product/specs/web-search.md` states the full rule in behavior terms, as its "Where a typed search runs" section does. `product/specs/acp.md`'s closing sentence points at the workspace-routing paragraph and the local-fallback sentence already there rather than repeating them.
- **Behavior only in the spec prose.** The corrected sentences describe hosts, workspaces, tokens, and the printed line, not module or function names, matching the Agent tool section's existing voice.
- **No code or test change.** The routing is already implemented and pinned by four suites. The defect is that two spec sentences describe a different rule, so this plan touches no source and adds no test.
- **Do not rewrite completed plans.** `web-search-11-workspace-routes.md` and `web-search-12-acp-tool.md` record what was planned. Slice 11's design decision already names the local-fallback case correctly; slice 12's spec bullet is what produced the simplified sentence. Plans are history, and this plan records the correction.

## Proposed changes

`product/specs/web-search.md`, Agent tool section. The paragraph stays as it is except for one sentence.

Before:

```markdown
The search runs on the host running the ACP loop: the machine running Janissary for a local session, and the remote machine for a remote-hosted run, with that workspace's merged tokens.
```

After:

```markdown
A granted search runs on the side that owns the tab, not on the host running the ACP loop: a local tab searches on the machine running Janissary, with that machine's tokens, and a remote tab searches on that tab's remote host, in that workspace, with that workspace's merged tokens. That includes a local-fallback ACP session on a remote tab, whose search still goes to the remote host and prints `Remote connection unavailable.` when the tab has no ready channel. A remote-hosted loop searches on the far side with that workspace's merged tokens.
```

`product/specs/acp.md`, Web search subsection, closing paragraph. The second sentence stays as it is.

Before:

```markdown
A granted step is a workspace step: the routing described above applies, so a `web` line reaches the same search as the typed command on the host running the loop.
```

After:

```markdown
A granted step is a workspace step: it follows the workspace routing described above, so a `web` line reaches the same search as the typed command and searches on the side that owns the tab.
```

No source, test, config, `help/`, or user-documentation change.

## Tests

No test changes. The behavior already exists and is pinned; only the two spec sentences change.

Existing cases that must keep passing unchanged through `$janissary/scripts/run.mjs check-diff`:

- `src/acp/run-prompt.test.ts` — `routes a local fallback session on a remote tab through the tab search` proves a local-fallback session on a remote tab reaches `searchWebInTab`, and `runs a web line through the tab search with the prompt signal` proves a local tab takes the same route.
- `src/web-search/tab-search.test.ts` — `searches on the remote machine for a remote tab` proves a remote tab goes to the port's `webSearch` and never the local one, and `returns the unavailable line without a local fallback` proves the no-channel line.
- `src/remote/serve-acp-loop.test.ts` — `runs a web line with the workspace tokens and the run signal` proves the far-side loop searches with the workspace's merged tokens.

Verify the prose by reading it:

- The corrected `web-search.md` sentence says the side that owns the tab decides where a granted search runs.
- It names a local tab, a remote tab, and a local-fallback session on a remote tab, including `Remote connection unavailable.`.
- It says a remote-hosted loop searches on the far side with the workspace's merged tokens.
- Every other sentence in both edited paragraphs is byte-for-byte unchanged.

## Verification

- `$janissary/scripts/run.mjs check-diff`.
- Re-read both edited sentences beside `src/web-search/tab-search.ts`, `src/file-read/tab-read.ts`, `src/file-read/remote-tab-port.ts`, and `src/remote/serve-acp-loop.ts`.
- Search the spec tree for "host running the ACP loop" and confirm neither `product/specs/web-search.md` nor `product/specs/acp.md` still carries it; the remaining copies are this plan's quote of the old wording and the completed plans, which are history.

## Spec

This fix is itself the spec correction. `product/specs/web-search.md`'s Agent tool section gains the tab-based routing rule, and `product/specs/acp.md`'s Web search subsection points at the workspace routing instead of naming the loop's host. No other spec section describes this route.

## Out of scope

- Changing `src/web-search/tab-search.ts`, `src/file-read/tab-read.ts`, `src/file-read/remote-tab-port.ts`, or `src/remote/serve-acp-loop.ts`.
- Rewriting the subscription paragraph in `product/specs/acp.md`'s Autonomous tool loop section; it already states the local-fallback case correctly.
- `product/specs/web-search.md`'s "Where a typed search runs" section, already correct.
- `help/web.md`, `help/commands.md`, and `documentation/user-documentation/`; none describes an agent search's host.
- Completed plans, including `web-search-11-workspace-routes.md` and `web-search-12-acp-tool.md`.
- Other backlog entries on the branch.
- Rebasing, merging, or resolving the branch's conflict with `master`.

## Rating basis

lines_added=0, files_edited=0, requirements=2, scenarios=0, new_units=0. Production counts are zero because the only edited files are two spec pages; the two requirements are the corrected rule in `web-search.md` and the corrected cross-reference in `acp.md`, and no test scenario applies to page prose. p = 1.578 + 0.705·ln(3) = 2.35, under the 3.461 threshold for 1.
