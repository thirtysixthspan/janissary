# Document the multi-agent tab and the fanout member completion

**Complexity: 2/10** — one new reference page, one table row, one navigation entry. No code changes.

## Goal

The multi-agent tab is the only view tab kind in the application with no page in the user documentation, and `fanout` is the only command shipped in this pull request that the documentation does not mention.

Every other view tab — editor, file navigator, notifications, conversations, sessions, the SQL browser — has a page linked from the Tab Types section of `documentation/.vitepress/config.mts`. The completion-context table in `documentation/user-documentation/command-bar/tab-completion.md` enumerates every position that completes and so is exhaustive by construction; it now omits the `fanout opencode:` member position this feature adds.

## Approach

One page, written as a reference for a reader who wants the exact facts about a comparison they have just been shown, plus the one missing table row and its navigation entry.

The page's material is `product/specs/multi-agent-tab.md`, but the spec is a contributor document: it is rewritten here for someone using the app, per `ai/guidelines/user-documentation.md`. The internal detail that does not serve the reader — the key scheme, the manager names, the projection — stays in the spec.

## Implementation steps

1. Write `documentation/user-documentation/tab-types/multi-agent-tab.md`. Lead with what the reader can now do, then the syntax, then what the tab shows, then the edges worth knowing: a refused member, the 1-to-8 bound, closing being the whole teardown, and what it does not do. The last of those is a reader's first question about a comparison tool, so it belongs on the page rather than only in the spec.
2. Add the page to the Tab Types list in `documentation/.vitepress/config.mts`, beside the other view tabs.
3. Add one row to the context table in `documentation/user-documentation/command-bar/tab-completion.md`, next to the existing `harness --model` row: for a `fanout` member token that already names its harness, the candidates are that harness's known models offered as `opencode:<model>`, and a bare `fanout` still completes filesystem paths.

## Tests

Documentation only. The build that would catch a broken link or a malformed page is `npm run docs:build`, which belongs to the human's end-of-work gate and is not run here — so verify by reading: the new page's filename matches the link added to the config, and the table row is a well-formed row of the existing table.

## Out of scope

- **`help.md`**, which already carries the `fanout` row this pull request added.
- **Documenting the declined gaps** — setup commands, keeping a winner, timings, a concurrency cap, per-member prompts, worktrees. None of them exist, so there is nothing to document.
- **Restructuring the completion reference**, which stays a table.

## Verification

Read the new page against `product/specs/multi-agent-tab.md` and confirm every command form and limit stated on the page is one the code actually implements — the member grammar, the 1-to-8 bound, the `multi-agent` label, and what a refused member reads.
