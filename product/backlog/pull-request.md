<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's test promise that the command grammar's defaults are 10 results, 10000 characters, basic, and auto by pinning those literal values in the command tests.

Existing Issue: The command tests build their expected defaults from the same exported constants the parser applies, so a change to `WEB_SEARCH_DEFAULT_RESULTS`, `WEB_SEARCH_DEFAULT_MAX_CHARS`, `WEB_SEARCH_DEFAULT_DEPTH`, or `WEB_SEARCH_DEFAULT_PROVIDER` leaves every assertion green even though the plan fixes those defaults at 10, 10000, `basic`, and `auto`. Severity: 3/10

Existing Risk: 3/10 - A later edit to a default silently changes search behavior and the primer's "up to 10 results by default" prose while the whole suite stays green, so nothing signals that the promised values moved.

Proposal Risk: 1/10 - The exported defaults and the primer's result-count prose become pinned to the plan's values; the only residual risk is that a deliberate change now has to update the test, which is the intended cost.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "pin the command grammar's default values in its tests". In `src/web-search/command.test.ts`, add a test beside the existing `defaults` fixture that asserts the exported defaults carry the plan's values: `WEB_SEARCH_DEFAULT_RESULTS` is 10, `WEB_SEARCH_DEFAULT_MAX_CHARS` is 10000, `WEB_SEARCH_DEFAULT_DEPTH` is `'basic'`, and `WEB_SEARCH_DEFAULT_PROVIDER` is `'auto'`. Build the expected values from literals rather than restating the constants, the way `src/file-glob/command.test.ts` pins `limit: 100` in its `defaults` fixture, so the assertion fails when any constant moves while the four imports still keep the exports in use. Add a second assertion that `WEB_SEARCH_PRIMER` contains `up to ${String(WEB_SEARCH_DEFAULT_RESULTS)} results by default`, tying the primer prose to the default result count. Leave every existing test in `src/web-search/command.test.ts` unchanged; they cover the no-flag path and must keep passing. To verify, temporarily change one default constant in `src/web-search/command.ts` and confirm the new assertion fails, then revert the change; do not alter the constant values or the primer text as part of the fix.
