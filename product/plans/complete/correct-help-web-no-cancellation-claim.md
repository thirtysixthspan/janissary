# Correct the web help page's no-cancellation claim

**Complexity: 1/10** — no production code, no production files edited, no test scenarios; four facets of one help paragraph (p=2.71).

## Goal

`help/web.md` opens by saying "A search has no cancellation: it runs until it answers or every provider it tries times out." That is true of a typed `web search` command and false of a search an `ask` or `tell` agent runs, which is tied to the prompt's abort signal. The page should say explicitly that only a typed search is uncancellable, and describe how an agent's search stops.

The page's later sections already state remote routing, provider fallback, and the disabled-provider reporting correctly. They stay unchanged.

## Approach

Rewrite the opening paragraph only. The first three sentences stay as written. The no-cancellation sentence begins "A typed search has no cancellation" instead of "A search has no cancellation". One sentence follows it covering the agent case:

> A search run by an `ask` or `tell` agent is cancelled with its prompt: the in-flight provider request is aborted, no further provider is tried, and its late result is suppressed; a local-fallback session's remote search has no cancel message, so only the late result is suppressed.

That sentence's claims are already stated in the functional specs, so nothing there needs to change:

- `product/specs/web-search.md` — "Where a typed search runs" says "A typed search has no cancellation. It runs until it answers or every provider it tries times out." The Agent tool section routes a granted search through the same search on the side that owns the tab.
- `product/specs/acp.md` — the tool dispatch paragraph says "Cancelling the prompt, or aborting a remote-hosted run, aborts an in-flight search and starts no further provider; a fallback session's remote search has no cancel message, so only its late result is suppressed."
- `src/acp/run-prompt.ts` — `runWorkspace` passes `request.abort.signal` to `searchWebInTab`, and `searchWebInTab` hands it to `webSearch`.
- `src/remote/serve-acp-loop.ts` — `searchWorkspaceCommand` passes the run's `controller.signal` to `webSearch`, and `cancel`/`abort` call `controller.abort()`.
- `src/web-search/search.ts` — `runWebSearch` calls `throwIfAborted()` before resolving, before each provider attempt, after a result arrives, and before failure lines are formatted, so an abort both starts no further provider and suppresses a late result.

## Design decisions

1. **Distinguish typed from agent, rather than hedge.** The absolute claim is the problem, so the page names the typed case outright and gives the agent case its own sentence. A vaguer "some searches can be cancelled" would leave the reader unable to tell which.

2. **Keep the agent sentence short.** A help page is not the spec. It states the user-visible outcome — the search stops with the prompt, the request aborts, no further provider runs, and a late answer is dropped — and carries only the one caveat a reader needs: a local-fallback session's remote search has no cancel message, so only its late result is suppressed.

3. **No other page changes.** `help/commands.md`'s one-line `web` row makes no cancellation claim. `documentation/user-documentation/advanced-agents/acp-agent.md` describes routing and grants but not cancellation, and its subject is the agent, not the typed command. `documentation/developer-documentation/web-search-providers.md` already says the provider `signal` "is absent for a typed search, which has no cancellation." Behavior is not changing, so no other documentation is affected.

4. **No code or test change.** The behavior is already implemented and pinned by existing tests; this is a prose correction in one help page.

## Implementation steps

1. In `help/web.md`, change the opening paragraph's last sentence to begin "A typed search has no cancellation" and add the agent-search sentence after it.
2. Read the revised paragraph against `product/specs/web-search.md`, the Cancellation section and tool dispatch paragraph of `product/specs/acp.md`, and the signal handoff in `src/acp/run-prompt.ts`, `src/remote/serve-acp-loop.ts`, and `src/web-search/search.ts`.
3. Run `$janissary/scripts/run.mjs check-diff`. The change is markdown only, so the command is expected to have nothing scoped to lint, typecheck, or test, and must exit 0.

## Tests

No automated tests. The change is prose in a help page plus the plan and backlog files, so there is no test surface. Run `$janissary/scripts/run.mjs check-diff` after the edit and confirm it exits 0.

Manual verification: read the revised opening paragraph and confirm the typed and agent cases are distinguishable, the remote-routing and provider paragraphs are untouched, and every claim matches the spec and code paths named above.

## Out of scope

- Changing `src/web-search/`, the ACP loop, or any provider or cancellation behavior.
- Changing `product/specs/web-search.md` or `product/specs/acp.md`; they already state both cases.
- Changing `help/commands.md`, `help/ask.md`, `help/tell.md`, or any page under `documentation/`; none carries the corrected claim.
- The other entries in `product/backlog/pull-request.md`.
