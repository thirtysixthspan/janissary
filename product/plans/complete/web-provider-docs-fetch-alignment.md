# Bring the web provider developer documentation up to date with fetch

**Complexity: 1/10** — documentation and spec prose only: 0 production lines, 0 code files, 0 behavioral requirements, 0 test scenarios, 0 new units (p=1.578).

## Goal

Make `documentation/developer-documentation/web-search-providers.md` and `product/specs/workspaced-agent.md` describe both `web search` and `web fetch` accurately now that fetch exists. The token-row checklist omits the new fetch spec, and several passages still describe search alone, which would leave a contributor following stale guidance.

## Approach

Correct the five named passages in place, using the code as the source of truth. Each edited sentence was checked against `src/web/providers/contract.ts`, `src/web/fetch/tab-fetch.ts`, `src/commands/web.ts`, `src/remote/filesystem/web-fetch-operation.ts`, and `src/remote/filesystem/web-search-operation.ts`. The shared `WebSearchCapability` (with its optional `signal`) serves both search and fetch; both remote operations call their core with `{ tokens, fetch }` and no `reportDisabled`; and both commands read their keys in the Janissary process. No behavior changes, so no code or tests change.

## Implementation steps

1. In `documentation/developer-documentation/web-search-providers.md`, "Token rows" section, "Adding a row" paragraph, add `product/specs/web-fetch.md` to the list of specs that enumerate the token files (the list currently ends with `product/specs/web-search.md`). Its Tokens section lists the tavily and tinyfish token files, so it belongs alongside the others.
2. In the same file, reword the key paragraph's first sentence from "A search provider's key is read by the Janissary process, which runs the search." to say a provider's key is read by the Janissary process that runs the search or fetch. Leave the rest of the paragraph (spawn: false, startup load, remote forwarding, ambient scrub) unchanged.
3. In the same file, "The capability" table, change the `signal` row from "Aborted when the caller cancels the search" to "Aborted when the caller cancels the search or fetch", and from "It is absent for a typed search, which has no cancellation" to "It is absent for a typed command, which has no cancellation". The `signal` is optional on the shared capability and is supplied only when the caller passes an abort signal.
4. In the same file, "Validation and failure" section, extend the remote sentence from "A search on a remote machine passes no `reportDisabled`" to "A search or fetch on a remote machine passes no `reportDisabled`", matching `webFetch(args, { tokens, fetch })` in `src/remote/filesystem/web-fetch-operation.ts` and the equivalent search operation. Leave the rest of the sentence unchanged.
5. In `product/specs/workspaced-agent.md`, "Where token files are read from" section, change "The search runs in the Janissary process itself, which reads the keys through `getProjectTokens`" to name both `web search` and `web fetch` as running in the Janissary process. Leave the surrounding sentences unchanged.

## Tests

None added. The change is documentation and spec prose only and alters no behavior. Verification is re-reading each edited sentence against the code named in the Approach and running `check-diff` to confirm nothing else broke.

## Spec

`product/specs/workspaced-agent.md` is updated in step 5 to name both `web search` and `web fetch`. `product/specs/web-fetch.md` already has a Tokens section; step 1 makes the developer documentation point to it.

## Docs

`documentation/developer-documentation/web-search-providers.md` is updated in steps 1 through 4. No help page or user documentation needs a change: no flag, command, default, or behavior changed.

## Out of scope

- Any source or test change.
- The page's search-flavoured title and other cosmetic wording the entry did not name.
- The other backlog entry about repointing technical-debt paths.
- The pull request title or description; this work item calls for no description correction.
- Editing `./product/backlog/issues.md`.
