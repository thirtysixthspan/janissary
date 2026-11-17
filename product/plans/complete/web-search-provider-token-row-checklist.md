# Complete the web-search provider reference's token-row checklist

**Complexity: 1/10** — no production code changes: one documentation sentence names the surfaces that must change when a provider token row is added (0 added lines, 0 files edited, 0 requirements of production behavior; p=1.578).

## Goal

`documentation/developer-documentation/web-search-providers.md`'s Token rows section tells a provider author where else a new `PROJECT_TOKENS` row must appear. Its checklist sentence — "The specs that enumerate the token files … need the new file wherever they list the existing ones, as does the user documentation table in …" — currently names `product/specs/workspaced-agent.md`, `product/specs/sandbox.md`, `product/specs/remote-server.md`, `product/specs/acp.md`, and `documentation/user-documentation/advanced-agents/tokens.md` as the complete set.

That set is incomplete. `product/specs/web-search.md`, `help/web.md`, and `documentation/user-documentation/advanced-agents/acp-agent.md` also name the bundled `tavily-token` and `tinyfish-token` files, so an author who follows the checklist would add a new provider's row and leave the behavior spec and two user-facing pages naming only Tavily and TinyFish. The fix makes the checklist name every current surface.

## Approach

This is a prose correction in one documentation file. The repository's code is authoritative: `PROJECT_TOKENS` in `src/project/tokens.ts` holds the `tavily` and `tinyfish` rows with `file: 'tavily-token'` and `file: 'tinyfish-token'`, and each row's comment ties those files to the bundled `web search` provider. Grepping `tavily-token` and `tinyfish-token` under `product/specs/`, `help/`, and `documentation/` yields the surfaces a new row must reach:

- `product/specs/web-search.md` — line 63 gives each provider's token file and read order.
- `product/specs/workspaced-agent.md` — already listed; names both files in its forwarded-token, lookup, and search-key passages.
- `product/specs/sandbox.md` — already listed; names both files in its token-file passage.
- `product/specs/remote-server.md` — already listed; names both files in its provisioning-map passage and the protocol-version note.
- `product/specs/acp.md` — already listed; describes the search keys as excluded from an ACP agent's environment without printing the file names, so it is affected by a new row even though the grep does not hit it.
- `help/web.md` — line 50 tells a reader where each provider's key file lives.
- `documentation/user-documentation/advanced-agents/tokens.md` — already named; its table has one row per file.
- `documentation/user-documentation/advanced-agents/acp-agent.md` — lines 43–44 say a search needs a `tavily-token` or `tinyfish-token` file.

`documentation/developer-documentation/web-search-providers.md` itself contains the names, but it is the page holding the checklist, not a target of it. No other file under those trees names either file.

## Design decisions

1. **Add `product/specs/web-search.md` to the spec list and leave the other four in place.** The web-search spec is the behavior spec for the feature, so it is the most likely page to be missed; the four already there remain correct.

2. **Name `help/web.md` and `documentation/user-documentation/advanced-agents/acp-agent.md` in the same sentence, after the tokens table.** Keeping one sentence for every surface preserves the section's shape: a reader adds the row, then visits one checklist. Splitting help pages into a separate paragraph would suggest they are optional.

3. **Change nothing else on the page.** The `example` row snippet, its `spawn: false` explanation, and every other paragraph stay byte-for-byte as they are — in particular the `spawn: false` advice, which is the guidance a search-provider row needs and is unchanged by this fix.

4. **No enforced check.** The checklist stays prose. Building a test or lint rule that ties `PROJECT_TOKENS` to these documents is a separate work item and is out of scope here.

## Implementation steps

One file changes: `documentation/developer-documentation/web-search-providers.md`.

1. **Rewrite the checklist sentence in Token rows.** Keep the opening "Adding a row is not only this table." Replace the spec list so it reads `product/specs/workspaced-agent.md`, `product/specs/sandbox.md`, `product/specs/remote-server.md`, `product/specs/acp.md`, and `product/specs/web-search.md`; then extend the clause after "as do" so it names the `documentation/user-documentation/advanced-agents/tokens.md` table, `help/web.md`, and `documentation/user-documentation/advanced-agents/acp-agent.md`.

2. **Leave the rest of the section unchanged.** The `example` snippet, the `name`/`file`/`env` paragraph, and the `REMOTE_PROTOCOL_VERSION` paragraph after the checklist stay exactly as they are.

## Tests

No automated tests. This is a documentation-only change with no behavior to cover, so it adds no test cases and removes none. `./scripts/run.mjs check-diff` is expected to report no changes to lint, typecheck, or tests for a file under `documentation/` — which is the correct result for a docs-only edit, not a gap.

## Out of scope

- Any code, test, spec, `help/` page, or user page change. The three currently unnamed pages are cited by the checklist, not edited.
- An enforced check that a `PROJECT_TOKENS` row appears in every document. The checklist remains a prose reminder (decision 4).
- Adding a new provider or token row. This changes only what an author is told to update.
- `documentation/developer-documentation/tab-plugins.md`, `editor-plugins.md`, and `overlay-plugins.md`. They describe other plugin families and name no search token files.

## Verification

`$janissary/scripts/run.mjs check-diff` — expected to run no tools for a documentation-only change and exit 0.

Manual, the grep: run `rg 'tavily-token|tinyfish-token' product/specs help documentation` and confirm every hit outside `documentation/developer-documentation/web-search-providers.md` is named by the revised sentence — `product/specs/web-search.md`, `product/specs/workspaced-agent.md`, `product/specs/sandbox.md`, `product/specs/remote-server.md`, `help/web.md`, `documentation/user-documentation/advanced-agents/tokens.md`, and `documentation/user-documentation/advanced-agents/acp-agent.md`.

Manual, the table: read the revised sentence beside `PROJECT_TOKENS` in `src/project/tokens.ts` and confirm each row's `file` has a named destination in every document that lists it.

Manual, the boundary: diff the page and confirm the only changed lines are the checklist sentence's spec list and user-documentation clause, with the `example` snippet and `spawn: false` advice untouched.
