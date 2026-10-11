# Show a stored effort the catalog does not offer

**Complexity: 2/10** — one derived value and one conditional option in the entry row, plus one test; no server change, and a value the tab already offers is untouched.

## Goal

The roles file stores any effort string verbatim, and the spec says so, but the entry row's effort `<select>` offered only `default` plus the catalog's levels. A stored value such as `ultra` matched no option, so the row rendered as though the entry held no effort — indistinguishable from the default, and one click away from being cleared for good. This fix renders the stored value as its own option so what the file holds is what the tab shows.

## Approach

Compute, per entry, whether its stored effort is a nonempty value the catalog does not offer; when it is, render one extra `<option>` carrying that exact string between `default` and the catalog levels. The select's `value` already binds to the stored effort, so it selects the new option automatically; choosing `default` still clears the stored value through the existing intent.

## Implementation

1. **`web/src/plugins/roles/RoleCard.tsx`** — inside the entry-row map, derive `stored` as the entry's effort when it is present and not in `efforts`, otherwise null, and render `stored === null ? null : <option value={stored}>{stored}</option>` after the `default` option and before the catalog levels. The map body becomes a block returning the `<li>`, since the derived value precedes the markup. No change to the change handler, the intent, or the `value` binding.
2. **`product/specs/roles.md`** — no change needed: it already states that an effort outside the fixed levels is stored verbatim, and this fix makes the tab match what the spec already promises. The user documentation's effort sentence is likewise unchanged.

## Tests

`web/src/plugins/roles/RolesTab.test.tsx`:

- a payload whose entry stores `effort: 'ultra'` renders a select whose value is `ultra` with an option of that name;
- switching that select to `default` still raises `set-entry-effort` with `effort: null`;
- the existing effort cases, where the stored value is in the catalog, keep passing and render no extra option.

## Out of scope

- Validating an out-of-catalog effort on the server or warning about it — the file stores any string by design, and the review entry that proposes a stale-entry warning was declined during planning.
- Sorting, filtering, or otherwise changing the catalog levels.
- The other recorded entry (sharing the home-over-project config-file resolution), which is worked separately.