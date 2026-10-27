# Fall back when the required help command index is unreadable

Complexity: 2/10

## Goal

Return the generated help summary whenever the required `commands.md` index cannot be read, even if the requested command page is readable.

## Approach

`readHelpPage` must read the required index before resolving any requested page. If that read fails, it returns the existing `unreadable` result so `src/commands.ts` uses `fallbackHelp`. Keep the existing missing-page and requested-page read behavior unchanged.

## Implementation steps

1. In `src/help-pages.ts`, read `commands.md` after confirming it is listed and return `{ kind: 'unreadable' }` if the read fails. Run `$janissary/scripts/run.mjs check-diff`.
2. In `src/help-pages.test.ts`, add a broken `commands.md` symlink beside a readable requested page and assert the request is unreadable. Run `$janissary/scripts/run.mjs check-diff`.
3. Clarify the unreadable-index fallback in `product/specs/application-commands.md`. Run `$janissary/scripts/run.mjs check-diff`.
4. Promote this plan, remove the selected PR backlog entry, run the check, and publish the change to the existing PR branch.

## Tests

Add one regression test in `src/help-pages.test.ts`: when the directory lists an unreadable `commands.md` and the requested page is readable, `readHelpPage` returns `{ kind: 'unreadable' }`. Existing missing-directory, missing-index, and unreadable-requested-page cases must continue to pass.

## Spec

Update `product/specs/application-commands.md` to state that an unreadable required index triggers the generated summary even when the requested page itself is readable.

## Docs

No user documentation change is needed. Existing user documentation already describes the help fallback behavior.

## Out of scope

- Changing help output, page lookup rules, or fallback content.
- Changing behavior for a missing requested page or an unreadable requested page.
- Updating the PR description or merging the PR.
