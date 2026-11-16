<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Record the abort rule in the web-search behavior spec and correct the repair plan's claim that it is already there.

Existing Issue: The aborted-search repair plan says `product/specs/web-search.md` already records that an aborted capability's original rejection is rethrown and nothing is disabled or reported, but that spec contains no abort or cancellation rule beyond "A typed search has no cancellation"; the rule exists in the aggregate plan's design decision and in `documentation/developer-documentation/web-search-providers.md`. Severity: 2/10

Existing Risk: 2/10 - a future change to the registry's abort guards has no behavior-spec sentence to check against, and the repair plan points a reader to text that is not there.

Proposal Risk: 1/10 - the spec states the rule and its synchronous-version-check exception; the code is unchanged.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "record the abort rule in the web-search behavior spec". Add a short cancellation paragraph to `product/specs/web-search.md` (near "Where a typed search runs" or "Disabled providers") stating that an agent search's attempt is tied to the prompt's signal; when it aborts, `runWebSearch` rethrows the abort before resolution, before each attempt, after a result, and before final failure lines; an aborted attempt that observes the signal disables and reports nothing, including a module without `search` or a non-array result, while a synchronous API-version mismatch is checked before activation and remains the documented disable path. Then correct `product/plans/complete/keep-aborted-search-from-disabling-provider.md` to cite the aggregate plan, the developer page, or the new spec paragraph instead of claiming the spec already had it. Verify against `src/web-search/search.ts`, `src/web-search/registry.ts`, `documentation/developer-documentation/web-search-providers.md`, and `product/specs/acp.md`; no code or test change.
