# ACP agent page: name the patch grant in the second tell-defaults sentence

**Complexity: 1/10** — 1 requirement drives a one-sentence prose correction with no production lines or files (p=2.07)

## Goal

The ACP agent page describes tell's default grants twice. Under **Which model it runs**, the sentence now ends "writing and editing workspace files, and applying a patch that changes several files at once", but the second description under **Let the agent look things up** still says only "database create/delete, browser eval, and writing and editing workspace files". A reader who trusts the second summary believes tell cannot apply a multi-file patch by default, so the same page teaches two different defaults. Both sentences should name the same fifteen default grants, with writing and editing still named separately from patching.

## Approach

Edit only the one sentence in `documentation/user-documentation/advanced-agents/acp-agent.md`, plus the plan and the backlog. Reuse the wording already added to the sentence under **Which model it runs** so the two summaries agree. Leave the ask description, the role-grant refusal sentence, the eight-step paragraph, and every other section of the page untouched. No source, test, help, other documentation, or spec change is needed: `product/specs/acp.md` already states that tell grants fifteen commands including `file patch`, and no test covers this page's prose.

## Implementation

1. `documentation/user-documentation/advanced-agents/acp-agent.md`, in **Let the agent look things up**: replace "Tell has those commands plus database create/delete, browser eval, and writing and editing workspace files." with "Tell has those commands plus database create/delete, browser eval, writing and editing workspace files, and applying a patch that changes several files at once." so it matches the page's earlier tell-defaults sentence. Keep the sentence on its existing line, as the earlier sentence already runs long, and leave every other line of the paragraph as it is.
2. `product/backlog/pull-request.md`: remove the resolved entry whole, restoring the comment-and-heading skeleton because it is the only entry.

## Tests

No test change. The page has no rendered-output or prose test, and the fix changes documentation only.

## Verification

- Read both tell-default sentences in `documentation/user-documentation/advanced-agents/acp-agent.md` and confirm neither omits the patch grant and both name writing and editing separately from patching.
- `$janissary/scripts/run.mjs check-diff`.

## Out of scope

- Changing ACP source, tests, or behavior.
- Editing `product/specs/acp.md`; it already states the fifteen-command default grant.
- Other help or user-documentation pages; `help/roles.md` and `documentation/user-documentation/tab-types/roles.md` already include the patch grant.
- The PR description; the work item calls for no description correction.
