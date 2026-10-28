# Client plugin capability inventory and shell deprecation

**Complexity: 3/10** — the change is confined to the client capability contract, its existing tests, and three developer references; the old host route remains in place as a compatibility shim.

## Goal

Keep the client plugin capability contract accurate and deprecate the unused `launchShellHere()` member without breaking API v2 callers.

## Approach

Retain `launchShellHere()` through API v2, mark it deprecated in its TypeScript contract, and emit one warning per client runtime when it is used. Point callers to their own sibling intent, as the shell plugin already does, and schedule removal for API v3 after at least two host minor releases. Keep the existing `launchShellFor` route untouched because the harness still uses it.

Update the binding guideline and developer reference to list all 27 client capability members grouped by purpose. Correct the functional spec and developer reference so shell siblings are described as the shell plugin's `sibling` intent. Record the deprecation and removal schedule in the API v2 reference.

## Implementation steps

1. Mark `launchShellHere()` deprecated in `web/src/plugins/api.ts` and add a once-per-runtime warning to its existing implementation in `web/src/plugins/plugin-client-capabilities.ts`.
2. Test that the deprecated method still sends its existing `launchShellFor` request while warning only once per runtime.
3. Replace the stale eight-member list in `ai/guidelines/plugins-tabs.md` with the complete grouped client contract.
4. Update `product/specs/tab-plugins.md` and `documentation/developer-documentation/tab-plugins.md` to describe the sibling intent and deprecation; enumerate the full client capability contract in the developer reference and update its count check.
5. Remove only this item's complete entry from `product/backlog/technical-debt.md` and promote this plan to `product/plans/complete/`.

## Tests

- Add one `web/src/plugins/api.test.ts` case asserting the deprecated capability remains wired to `launchShellFor` and warns once across repeated use.
- Keep the existing shell sibling-intent tests passing.
- Update `src/plugins/documentation.test.ts` to the current client capability count alongside its matching changelog update, then run the diff-scoped checks.

## Spec and documentation

- Update `product/specs/tab-plugins.md` with the shell sibling-intent behavior and the retained API v2 deprecation window.
- Update `ai/guidelines/plugins-tabs.md` with the 27 client capability members grouped by purpose.
- Update `documentation/developer-documentation/tab-plugins.md` with the complete client capability reference, sibling-intent behavior, and API v3 removal schedule.

## Out of scope

- Removing the capability or changing its `launchShellFor` compatibility route before API v3.
- Changing the harness's `launchShellFor` use or the shell plugin's existing `sibling` intent.
- Changing any other backlog entry or historical implementation plan.
