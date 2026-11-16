<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Add typed web search to the ACP spec's list of untagged typed outputs.

Existing Issue: The ACP spec's tag paragraph enumerates the typed outputs that carry no `[<host>] ` tag as `file read`, `file glob`, `file grep`, `file write`, and `file edit`, omitting typed `web search`, while the user documentation already lists `web search` among the untagged typed outputs and `searchWebInTab` returns a remote tab's typed result through `withRemoteTabPort` with no tag. Severity: 3/10

Existing Risk: 2/10 - a reader of the spec could expect a typed remote web result to be tagged or distrust the tag rule, and the two documents disagree on an observable transcript detail.

Proposal Risk: 1/10 - the spec list matches the user documentation and the routing code; no behavior changes.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "add typed web search to the ACP spec's untagged typed-output list". In `product/specs/acp.md`, the tag paragraph, change "the output of typed `file read`, `file glob`, `file grep`, `file write`, and `file edit` are untagged" to include `web search` after `file grep`, matching the order in `documentation/user-documentation/advanced-agents/acp-agent.md`. Leave the Web search section and every other sentence unchanged. Verify against `src/acp/run-prompt.ts` (`tagged` applies only to a remote session's workspace step) and `src/web-search/tab-search.ts`; no code or test change.


* Fix and test the first-result truncation when the note cannot fit alongside the link line.

Existing Issue: In `src/web-search/render.ts`, `cutFirstResult` returns the link line and the truncation note whenever `room = maxChars - link.length - 3 - note.length` is at most 1, so with the 200-character minimum, a 150-character link and a two-result note can produce about 203 characters and omit the snippet even though the link line alone fits; no render test covers that boundary. Severity: 3/10

Existing Risk: 2/10 - a long URL with a short snippet can exceed the user's `--max-chars` and drop the snippet, contrary to the plan's budget rule, and the untested branch can regress unnoticed.

Proposal Risk: 1/10 - the output becomes deterministic and stays within the budget; only the over-budget edge changes.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "cover and correct the first-result truncation boundary". Add a case to `src/web-search/render.test.ts` with `maxChars: 200`, two results, a first link line between `maxChars - note.length - 3` and `maxChars`, and a short snippet. Decide the precedence the plan implies — the budget includes the note, so when the note cannot fit with the link line the link line is printed alone within budget — and implement it in `cutFirstResult` in `src/web-search/render.ts`: return the link line alone when `link.length + note.length` exceeds `maxChars`; when `room === 1`, print the link line plus an indented `…` and the note, which fits exactly; when `room <= 0`, print the link line and note without a snippet; otherwise keep the existing cut. Update the Truncation paragraph of `product/specs/web-search.md` and the output paragraph of `help/web.md` to state that the note is dropped when it cannot fit with the link line, and add the new test at the boundary. Keep the existing whole-result, over-budget-link, and empty-list cases passing.


* Record the abort rule in the web-search behavior spec and correct the repair plan's claim that it is already there.

Existing Issue: The aborted-search repair plan says `product/specs/web-search.md` already records that an aborted capability's original rejection is rethrown and nothing is disabled or reported, but that spec contains no abort or cancellation rule beyond "A typed search has no cancellation"; the rule exists in the aggregate plan's design decision and in `documentation/developer-documentation/web-search-providers.md`. Severity: 2/10

Existing Risk: 2/10 - a future change to the registry's abort guards has no behavior-spec sentence to check against, and the repair plan points a reader to text that is not there.

Proposal Risk: 1/10 - the spec states the rule and its synchronous-version-check exception; the code is unchanged.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "record the abort rule in the web-search behavior spec". Add a short cancellation paragraph to `product/specs/web-search.md` (near "Where a typed search runs" or "Disabled providers") stating that an agent search's attempt is tied to the prompt's signal; when it aborts, `runWebSearch` rethrows the abort before resolution, before each attempt, after a result, and before final failure lines; an aborted attempt that observes the signal disables and reports nothing, including a module without `search` or a non-array result, while a synchronous API-version mismatch is checked before activation and remains the documented disable path. Then correct `product/plans/complete/keep-aborted-search-from-disabling-provider.md` to cite the aggregate plan, the developer page, or the new spec paragraph instead of claiming the spec already had it. Verify against `src/web-search/search.ts`, `src/web-search/registry.ts`, `documentation/developer-documentation/web-search-providers.md`, and `product/specs/acp.md`; no code or test change.
