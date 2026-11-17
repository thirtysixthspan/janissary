<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the description's and plan's web-search verification steps that promise result counts, snippet lines, and the truncation note the feature does not always print.

Existing Issue: The plan's Verification steps 1 and 5 and the description's Happy paths steps 1 and 2 state three results each with an indented snippet and the truncation note whenever the first result's link line leaves room, while the feature may return fewer than three results, prints only the link line for a result with no snippet, and omits the note when no results were left out, as the plan's Result count, Output, and Truncation decisions and `product/specs/web-search.md` all state. Severity: 2/10

Existing Risk: 2/10 - A verifier whose search returns fewer results, a link-only result, or a list that fits without truncation reads the correct output as a delivery failure and spends a review cycle on behavior every other artifact says is right.

Proposal Risk: 1/10 - The steps remain manual expectations over live provider output, but they now name every condition the code applies.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "make the web-search verification steps state the result-count, snippet, and truncation-note conditions". In `product/plans/complete/web-search.md`, reword Verification step 1 to expect up to three results, each a `- [<title>](<url>)` line followed by an indented snippet line when the provider supplied one and only the link line otherwise, and reword step 5 to expect fewer than ten results, with the note when results were left out and the first result's link line leaves room for it and the link line alone when the link and note cannot share the budget. Make the same conditions in the description's Happy paths steps 1 and 2, leaving the commands, step numbers, and every other step byte-for-byte. Do not change `src/web-search/render.ts` or `src/web-search/render.test.ts`: `renderResult` already prints only the link for an empty snippet, `wholeResultCount` and `cutFirstResult` already gate the note on results left out, and the render suite pins the boundary cases. Verify by reading the four steps beside `renderResults`, the plan's Output and Truncation decisions, and the Output section of `product/specs/web-search.md`, and confirm no other line changed.


* Complete the new web-search provider reference's token-row checklist so it names every spec and help page that lists the bundled token files.

Existing Issue: The Token rows section of `documentation/developer-documentation/web-search-providers.md` names the four workspace and ACP specs plus `documentation/user-documentation/advanced-agents/tokens.md` as the complete set of places a new token row must be added, while `product/specs/web-search.md`, `help/web.md`, and `documentation/user-documentation/advanced-agents/acp-agent.md` also name the bundled `tavily-token` and `tinyfish-token` files and would be left stale by an author following that list. Severity: 2/10

Existing Risk: 2/10 - A future bundled provider adds its row, updates the listed files, and leaves the behavior spec and two user pages naming only Tavily and TinyFish, so a reader gets a different provider set from the code.

Proposal Risk: 1/10 - The checklist remains a prose reminder rather than an enforced check, but it names every current surface that must change.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "complete the web-search provider reference's token-row checklist". In `documentation/developer-documentation/web-search-providers.md` Token rows, rewrite the sentence beginning "The specs that enumerate the token files" so the spec list adds `product/specs/web-search.md` to `product/specs/workspaced-agent.md`, `product/specs/sandbox.md`, `product/specs/remote-server.md`, and `product/specs/acp.md`, and so the user-documentation clause names `help/web.md` and `documentation/user-documentation/advanced-agents/acp-agent.md` alongside the `documentation/user-documentation/advanced-agents/tokens.md` table. Keep the `example` row snippet and its `spawn: false` advice unchanged, and change no code, test, spec, help page, or user page. Verify by grepping `tavily-token` and `tinyfish-token` under `product/specs`, `help`, and `documentation` and confirming every current hit is named by the revised sentence, and by reading it beside the `PROJECT_TOKENS` table in `src/project/tokens.ts`.
