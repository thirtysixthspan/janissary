# Record the abort rule in the web-search behavior spec

**Complexity: 1/10** — no production code and no production file edits; five documented requirements drive the score (p=2.84).

## Goal

`product/plans/complete/keep-aborted-search-from-disabling-provider.md` says the abort rule was "already recorded in `product/specs/web-search.md`", quoting it as "the abort check runs before every classification: when the capability's signal is aborted, the original rejection is rethrown unchanged and nothing is disabled or reported." That sentence is not in the spec, and neither is any abort or cancellation rule beyond "A typed search has no cancellation. It runs until it answers or every provider it tries times out." The rule lives in the aggregate plan's guarded-activation decision in `product/plans/complete/web-search.md` and in `documentation/developer-documentation/web-search-providers.md`.

A reader who follows the repair plan to the spec finds nothing to check a future change to the registry's abort guards against, and the plan cites text that is not there. This fix adds the rule to the behavior spec and repoints the repair plan at sources that exist.

## Approach

1. **`product/specs/web-search.md` — new `### Cancellation` section**, placed after `### Where a typed search runs` and before `### Provider selection`. Three short paragraphs in the spec's existing voice, with no function or file names:
   - Which searches can be cancelled: an agent search that runs in the same process as its prompt is tied to that prompt's signal; a search the tab forwards to its remote machine has no cancellation on the caller's side, and `[[acp]]` holds the agent cases.
   - What an abort does: the search rejects with the abort instead of printing a result or a failure line, at each of the four guarded points — before any provider is resolved, between attempts, after a provider's results, and before the final failure lines. An attempt already under way that sees the abort is a cancellation and not a plugin failure: it disables no provider and reports nothing, including a module without a search function or one that answers with something other than a list.
   - The exception: the provider API-version check runs before a module is imported, so a mismatch still disables and reports as the failures section describes, while the search's own signal check runs before each attempt starts.

2. **`product/plans/complete/keep-aborted-search-from-disabling-provider.md` — three spots**, so the plan no longer claims the spec already carried the rule:
   - Its Goal paragraph cites "the rule already recorded in `product/specs/web-search.md`"; repoint it to the aggregate plan's guarded-activation decision and the developer page.
   - Design decision 3 is titled "No spec change" and quotes the missing sentence; scope the title to that repair and name the sources that existed.
   - The Out of scope bullet repeats "the spec already describes this behavior"; name the aggregate plan and developer page instead.

3. **Leave the behavior alone.** No production code, test, `help/`, or user-documentation change. `src/web-search/search.ts`, `src/web-search/registry.ts`, and `src/web-search/registry.test.ts` already implement and cover the rule; the spec text is the only gap.

## Design decisions

1. **A dedicated section, not a paragraph in an existing one.** `### Where a typed search runs` is about which machine answers, and `### Disabled providers` is about a provider that broke. Cancellation is a third aspect: it decides whether a search prints at all, and it is the one path that disables nothing. `product/specs/acp.md` already keeps its own `### Cancellation` section, so the shape matches.

2. **Spec prose, no identifiers.** The entry names `runWebSearch` and the registry's branches, but the behavior spec describes behavior, not implementation. The four guarded points become the plain sequence a reader can check: before resolution, between attempts, after a result, and before the failure lines.

3. **State the remote limit.** The local fallback session's forward to a remote machine passes no signal, so only its late result is suppressed; `product/specs/acp.md` already states that. The new section scopes cancellation to searches that run beside their prompt and links `[[acp]]`, so the spec does not claim a cancellation the caller does not have.

4. **Keep the API-version exception.** It is the one disable decision the cancellation rule does not touch: `runAttempt` checks the manifest's version before `activate`, and a mismatch disables and reports regardless of the signal. Without that sentence, a future reader could take "an aborted attempt disables nothing" to cover it.

## Implementation steps

1. Read `src/web-search/search.ts`, `src/web-search/registry.ts`, `src/web-search/tab-search.ts`, `src/acp/run-prompt.ts`, `src/remote/serve-acp-loop.ts`, `documentation/developer-documentation/web-search-providers.md`, and `product/specs/acp.md` to confirm the four guarded points, the two no-disable branches, the version check's position, and the remote paths that pass no signal.
2. Add the `### Cancellation` section to `product/specs/web-search.md` between `### Where a typed search runs` and `### Provider selection`.
3. Run `$janissary/scripts/run.mjs check-diff`.
4. Rewrite the Goal paragraph, design decision 3, and the Out of scope spec bullet of `product/plans/complete/keep-aborted-search-from-disabling-provider.md` to cite the aggregate plan and developer page.
5. Run `$janissary/scripts/run.mjs check-diff` and confirm it exits 0.
6. Run `git diff` to confirm only the spec and that one plan changed, and to read the new section against the code.

## Tests

No automated tests. The change is prose in one spec and one completed plan, and the behavior it describes already has coverage in `src/web-search/registry.test.ts` and `src/web-search/search.test.ts`. Run `$janissary/scripts/run.mjs check-diff` after each edit; the diff is markdown, so the run is lint-only and must exit 0.

Manual verification: each of the four guarded points in `runWebSearch` maps to a clause in the new section; both no-disable branches in `runAttempt` are covered by the "disables no provider and reports nothing" clause; the version check at the top of `runAttempt` is named as the exception; and no line of either file other than the intended ones differs.

## Out of scope

- Any production code, test, `help/`, or user-documentation change.
- `product/specs/acp.md`, whose cancellation and web-command paragraphs already describe the agent cases correctly.
- `documentation/developer-documentation/web-search-providers.md`, which already states the rule.
- Other pull-request backlog entries.
