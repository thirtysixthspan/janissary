# Stop reporting a conflict on the tab's own description save

Complexity: 2/10 (threshold: 7).

## Goal

Stop the roles tab from raising `The description of "<name>" changed elsewhere — showing the stored one.` after a description this client wrote itself comes back republished.

## Approach

Every accepted edit republishes the payload, so the tab's own save always arrives as a stored value the tab did not write. The refusal has to be reserved for a value that displaced somebody's typing.

`useRoleDraft` runs its render-phase adjustment whenever `baseline !== authoritative` and sets `conflicted` from `draft !== baseline` alone. After this client commits its own text, the republished value differs from the old baseline while the draft is exactly the text just submitted, so the half-written test reports a conflict. Require both halves: `draft !== baseline && draft !== authoritative`. A republished value that is the draft itself is followed silently; a value that arrives under a genuine active draft still replaces it and still reports, because that draft was written against text the file no longer holds.

`RoleCard` raises the line from a `useEffect` keyed on `conflicted`, so it needs no change.

## Implementation steps

1. Require both halves of the test in `web/src/plugins/roles/useRoleDraft.ts` and bring its comment up to date. Run `./scripts/run.mjs check-diff`.
2. Add the regression to the payload-update block in `web/src/plugins/roles/RolesTab.test.tsx`. Run `./scripts/run.mjs check-diff`.
3. Update `product/specs/roles.md`, promote this plan, and remove only the resolved entry from the pull request backlog. Run `./scripts/run.mjs check-diff`, then commit and push to the same open PR.

## Tests

Commit a description edit, republish the payload carrying the text just written, and assert the field holds that text with no refusal line raised and nothing re-sent. The existing cases stand: an untouched field follows the stored text and raises nothing, an active draft is replaced and the refusal appears, a change to another role leaves the draft alone, and a server refusal leaves the typed text on screen.

## Out of scope

The name field, whose card remounts on a rename; typing that arrives on top of an in-flight save, which genuinely is displaced; the refusal line's wording; server-side change detection; `help.md` and `documentation/user-documentation/`, which never described the conflict line; PR description changes.