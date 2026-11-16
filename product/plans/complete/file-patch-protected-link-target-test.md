# Cover protected targets of moved patch links

**Complexity: 1/10** — one behavioral requirement and one test scenario, with no production changes (p=2.32)

## Goal

Verify that following a moved relative symbolic link into a protected target is refused.

## Approach and implementation

Extend `src/file-patch/sections.test.ts` with a link that initially resolves to a permitted file but resolves into `.git` after its move. Assert a subsequent content update fails with `Protected file`, preserving existing cases.

## Tests and verification

Run the section tests and diff-scoped checks. This adds coverage only; it changes no user-visible behavior, spec, or documentation.

## Out of scope

Changing path policy, patch behavior, or symbolic link text.
