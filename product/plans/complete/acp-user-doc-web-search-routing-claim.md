# Correct the ACP user doc's web-search routing and host-tag claims

**Complexity: 1/10** — one user-doc sentence corrected, no production files, 2 requirements (p=2.35).

## Goal

`documentation/user-documentation/advanced-agents/acp-agent.md` must describe where a granted `web search` runs the way the app routes it: by the side that owns the tab, not by the host running the agent. A remote tab searches on the remote machine, in that workspace, with its merged tokens; a local-fallback ACP session on a remote tab still searches remotely, but only a remote-hosted session's workspace step carries the `[<host>] ` tag.

## Issue

Recorded on PR #2010's branch backlog, severity 3/10:

> Deliver the plan's ACP user-doc paragraph with the tab-based routing and host-tag rule a granted web search actually follows.

The remote paragraph of the page says:

> A granted `web search` also runs on the host running the agent, so on a remote tab it uses the remote machine's token files (forwarded tokens win), and its step carries the `[<host>] ` tag.

Both claims are wrong for a local-fallback session on a remote tab. `AcpSessionManager` can run the loop locally on a remote tab; that session still reaches the tab's search route, which sends the search to the remote machine, so the search is remote while the step is local and untagged.

Verified against the code:

- `src/acp/run-prompt.ts` (`runCorePrompt`, `runWorkspace`) sends every `isWebCommandLine` step to `searchWebInTab(managers, label, command, request.abort.signal)`. The session object does not choose the host.
- `src/web-search/tab-search.ts` (`searchWebInTab`) asks `localReadRoot` for the tab's local root. A remote tab returns `undefined`, so it calls `searchRemote` through `withRemoteTabPort` and runs `port.webSearch(parsed)` on the far side, in that workspace, with its merged tokens.
- `src/acp/run-prompt.ts`'s `tagged` prefixes a workspace step with `[<host>] ` only when the session is remote (`'remote' in session`) and the step reports `workspace: true`. A local-fallback session on a remote tab has `remoteHost === undefined`, so its step is untagged even though the search ran remotely.
- `src/acp/run-prompt.test.ts`'s `routes a local fallback session on a remote tab through the tab search` pins the remote search, and `leaves a remote tab's fallback local workspace step untagged` pins the untagged step. `src/acp/run-prompt.test.ts`'s `tags a remote tab's web step with the host on the transcript and record lines` pins the remote-hosted tag.
- `product/specs/web-search.md`'s Agent tool section and `product/specs/acp.md`'s Web search subsection already state the tab-based route and the local-fallback case correctly.

The completed subplan `product/plans/complete/web-search-13-default-grants.md` records the older, incorrect user-doc wording. That recorded wording is kept byte-for-byte as history; this plan records the correction. A separate repair, recorded in `product/plans/complete/web-search-saved-tell-verification-expectation.md`, rewrote the subplan's Verification step 3 in place, so that one step is current while the subplan's recorded user-doc wording remains historical.

## Approach

1. In `documentation/user-documentation/advanced-agents/acp-agent.md`, replace only the sentence beginning "A granted `web search` also runs on the host running the agent" with the tab-based routing rule and the corrected tag rule.
2. Keep the rest of the remote paragraph, including the `file read`, `file glob`, mutation, database/browser/question, and closing untagged typed-command sentences, byte-for-byte unchanged.
3. Re-read the edited sentence beside `src/acp/run-prompt.ts` and `src/web-search/tab-search.ts`.
4. Search the documentation tree for the old phrasing to confirm no other page repeats it.

## Design decisions

- **Route by tab, not by loop host.** The code decides from the tab's `remote` field. The corrected sentence names the side that owns the tab, so a local-fallback session on a remote tab reads correctly: the search goes remote even though the loop is local.
- **Keep the corner case explicit.** A local-fallback session on a remote tab is the case the old wording contradicted. The corrected sentence says the search is still remote and the workspace step is untagged, so a reader debugging a failed search looks at the remote host and that workspace's tokens rather than at local token files.
- **Fold the tag rule into the same sentence.** The old sentence attached the tag to every remote-tab search. The correction says only a remote-hosted ACP session's workspace step carries it, which matches `tagged` and leaves the paragraph's later "A remote workspace step shows `[<host>] `…" sentence consistent when read as a remote-hosted session's step.
- **Keep the token wording.** A remote tab's merged tokens and a forwarded token winning are already what `product/specs/web-search.md` says; only the host claim and the tag claim change.
- **No code, test, or spec change.** The routing and tag behavior is already implemented and pinned. The defect is in one user-doc sentence, and both specs already describe the correct rule.
- **Do not rewrite the completed subplan.** `web-search-13-default-grants.md` records what was planned at the time. This plan records the corrected wording instead.

## Proposed changes

`documentation/user-documentation/advanced-agents/acp-agent.md`, the remote paragraph in "In a workspace or on another host". The paragraph stays as it is except for one sentence.

Before:

```markdown
A granted `web search` also runs on the host running the agent, so on a remote tab it uses the remote machine's token files (forwarded tokens win), and its step carries the `[<host>] ` tag.
```

After:

```markdown
A granted `web search` follows the tab rather than the host running the agent: it runs on the side that owns the tab, so a remote tab searches on the remote machine, in that workspace, with that workspace's merged tokens (a forwarded token wins). Only a remote-hosted ACP session's workspace step carries the `[<host>] ` tag; a local-fallback session on a remote tab still searches remotely, but its workspace step is untagged.
```

No source, test, config, spec, `help/`, or other documentation change.

## Tests

No test changes. The behavior already exists and is pinned; only one user-doc sentence changes.

Existing cases that must keep passing unchanged through `$janissary/scripts/run.mjs check-diff`:

- `src/acp/run-prompt.test.ts` — `routes a local fallback session on a remote tab through the tab search` proves the loop reaches `searchWebInTab` for a remote tab.
- `src/acp/run-prompt.test.ts` — `leaves a remote tab's fallback local workspace step untagged` proves the local-fallback step carries no host tag.
- `src/acp/run-prompt.test.ts` — `tags a remote tab's web step with the host on the transcript and record lines` proves a remote-hosted web step is tagged.
- `src/remote/serve-acp-loop.test.ts` — `runs a granted web search against the workspace and reports the result as a workspace step` proves the far-side loop searches with the workspace tokens and reports a workspace step.

Verify the prose by reading it:

- The corrected sentence says the side that owns the tab decides where a granted search runs.
- It says a remote tab searches on the remote machine, in that workspace, with the merged tokens, and that a forwarded token wins.
- It says only a remote-hosted ACP session's workspace step carries `[<host>] `, and a local-fallback session on a remote tab searches remotely with an untagged step.
- Every other sentence in the paragraph is byte-for-byte unchanged.

## Verification

- `$janissary/scripts/run.mjs check-diff`.
- Re-read the edited sentence beside `src/acp/run-prompt.ts` and `src/web-search/tab-search.ts`.
- Search the documentation tree for "host running the agent", "forwarded tokens win", and "its step carries" to confirm the corrected page is the only one that described this routing and no stale copy remains.

## Spec

No spec change. `product/specs/web-search.md`'s Agent tool section already states the tab-based route, including the local-fallback session and its `Remote connection unavailable.` line, and `product/specs/acp.md`'s Web search subsection already routes a granted step by the side that owns the tab. The user doc is brought in line with them.

## Out of scope

- Changing `src/acp/run-prompt.ts`, `src/web-search/tab-search.ts`, or any other source file.
- Adding or changing tests.
- Changing `product/specs/web-search.md` or `product/specs/acp.md`; both are already correct.
- `product/plans/complete/web-search-13-default-grants.md` and any other completed plan.
- Other pages under `documentation/user-documentation/`.
- Other backlog entries on the branch.
- Rebasing, merging, or resolving the branch's conflict with `master`.

## Rating basis

lines_added=0, files_edited=0, requirements=2, scenarios=0, new_units=0. Production counts are zero because the only edited file is a user-documentation page; the two requirements are the tab-based routing rule and the host-tag rule, and no test scenario applies to page prose. p = 1.578 + 0.705·ln(3) = 2.35, under the 3.461 threshold for 1.
