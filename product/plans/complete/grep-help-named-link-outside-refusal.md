# Correct the typed grep help's named-symlink `--path` claim
**Complexity: 1/10** — documentation-only wording fix; no production lines, files, requirements, scenarios, or units (p=1.578).

## Issue

`help/file.md`, in **Searching contents**, says a `--path` naming a single file is filtered like a directory search and that a symbolic link among the skipped kinds yields `(no matches)` with no reason. Earlier in the same paragraph it says a path whose real location is outside the root is refused as `Outside the workspace: <path>.`. A named link that resolves outside the workspace gets the refusal, not `(no matches)`, so the page states two different outcomes for the same input.

`src/file-grep/path-target.ts` decides this in `resolveContained`: it canonicalizes the named target and calls `checkRealTarget` before the final-link skip. An outside real target is refused first; an in-root link, a dangling link, or a link to a secret is skipped. `src/file-grep/grep.test.ts` pins the outside final link as `Outside the workspace: out.txt.` and the in-root final link as `(no matches)`, while `src/file-grep/path-target.test.ts` covers in-root file and folder links, an outside final link, and dangling links. Production behavior is correct and unchanged.

## Goal

Make the help page describe the resolver's three named-link outcomes without contradicting its own containment rule: `(no matches)` for a dangling link or one that resolves inside the workspace, and `Outside the workspace: <path>.` for one whose real target is outside the root. Keep the existing `Path not found` and real-location-outside rules, and leave the list of ordinary skips (git-ignored, secret, binary, over 2 MB, filtered) intact.

## Approach

A single prose correction in `help/file.md`. Remove "a symbolic link" from the ordinary skip list and add a sentence that splits the link outcome by its real target. No production code, tests, or spec changes are needed. `product/specs/acp.md` already attributes an outside-resolving link to the containment refusal and limits the no-match answer to a named path the file set actually skips, so it stays as written.

## Implementation steps

1. In `help/file.md`, in the **Searching contents** paragraph that begins "A bad `--path` prints one line naming it as you typed it", drop "a symbolic link" from the list of files that answer `(no matches)`.
2. Add a following sentence to that paragraph: a symbolic link named as `--path` is skipped the same way when it is dangling or its real target is inside the workspace, while one whose target resolves outside the root is refused as `Outside the workspace: <path>.`. Keep the preceding `Path not found` and real-location-outside rules and the rest of the paragraph unchanged.
3. Re-read the corrected paragraph against `src/file-grep/path-target.ts` (`resolveContained`), `src/file-grep/path-target.test.ts` ("links and canonical targets"), and `src/file-grep/grep.test.ts` ("resolver diagnostics", "final link") to confirm every outcome named on the page matches the implementation and tests.

## Tests

None new. This is a documentation correction with no behavior change, so there is no new behavior to cover. The existing `src/file-grep/path-target.test.ts` and `src/file-grep/grep.test.ts` cases named above already pin the outcomes the revised sentence now describes. Run `$janissary/scripts/run.mjs check-diff` after the edit to confirm the markdown-only diff leaves lint, typecheck, and tests green.

## Specs and docs

- `help/file.md`: correct the named-symlink `--path` sentence in **Searching contents**.
- `product/specs/acp.md`: checked; no update needed. Its File grep section already records the outside-link containment refusal and limits `(no matches)` to a named path the file set skips.
- `documentation/user-documentation/`: checked; no page describes typed grep's named-symlink `--path` behavior.

## Out of scope

- Any production or test change, including `src/file-grep/path-target.ts`, `src/file-grep/path-target.test.ts`, and `src/file-grep/grep.test.ts`; the resolver and its tests are already correct.
- Any wording in `help/file.md` beyond the named-link `--path` sentence and its list item.
- Any spec or user-documentation edit; `product/specs/acp.md` and the user docs already agree with the resolver.
- Any change to typed grep behavior, diagnostics precedence, or remote handling.
