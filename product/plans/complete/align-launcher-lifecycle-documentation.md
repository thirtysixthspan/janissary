# Align launcher lifecycle documentation with runtime behavior

**Complexity: 2/10** — correct the launcher plan and ACP spec, then make the named wording corrections in the live PR description.

The completed plan and PR description contain stale cursor and gate terminology, and the ACP spec says typed `acp` commands use the full tool table even on a restricted tab.

## Goal

Document the current summarizer change cursor, tab ownership, gate field, and tab-owned ACP tool policy without changing runtime behavior.

## Approach

1. Reconcile `product/plans/complete/sidebar-launcher-tab.md` with the runtime cursor (`revision`, `length`, and tab `incarnation`), `gateNeedsUser`, and `startAcp({ withoutTools: true })` enforcement in `src/acp/manager.ts`.
2. Correct `product/specs/acp.md` to state that typed prompts remain restricted on a tab with the sticky no-tools policy.
3. Correct only the named paragraphs in the live PR description after the docs commit is pushed.

## Tests

- Use the existing transcript revision, tab incarnation, ACP no-tools, and launcher summarizer tests as references; runtime behavior is unchanged.
- Run `./scripts/run.mjs check-diff`.

## Out of scope

- Runtime or test changes.
- Changes to other PR description text.
