<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Complete the new web-search provider reference's token-row checklist so it names every spec and help page that lists the bundled token files.

Existing Issue: The Token rows section of `documentation/developer-documentation/web-search-providers.md` names the four workspace and ACP specs plus `documentation/user-documentation/advanced-agents/tokens.md` as the complete set of places a new token row must be added, while `product/specs/web-search.md`, `help/web.md`, and `documentation/user-documentation/advanced-agents/acp-agent.md` also name the bundled `tavily-token` and `tinyfish-token` files and would be left stale by an author following that list. Severity: 2/10

Existing Risk: 2/10 - A future bundled provider adds its row, updates the listed files, and leaves the behavior spec and two user pages naming only Tavily and TinyFish, so a reader gets a different provider set from the code.

Proposal Risk: 1/10 - The checklist remains a prose reminder rather than an enforced check, but it names every current surface that must change.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "complete the web-search provider reference's token-row checklist". In `documentation/developer-documentation/web-search-providers.md` Token rows, rewrite the sentence beginning "The specs that enumerate the token files" so the spec list adds `product/specs/web-search.md` to `product/specs/workspaced-agent.md`, `product/specs/sandbox.md`, `product/specs/remote-server.md`, and `product/specs/acp.md`, and so the user-documentation clause names `help/web.md` and `documentation/user-documentation/advanced-agents/acp-agent.md` alongside the `documentation/user-documentation/advanced-agents/tokens.md` table. Keep the `example` row snippet and its `spawn: false` advice unchanged, and change no code, test, spec, help page, or user page. Verify by grepping `tavily-token` and `tinyfish-token` under `product/specs`, `help`, and `documentation` and confirming every current hit is named by the revised sentence, and by reading it beside the `PROJECT_TOKENS` table in `src/project/tokens.ts`.
