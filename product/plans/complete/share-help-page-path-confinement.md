# Share help-page path confinement

**Complexity: 2/10** — extract one small filesystem check and replace its two copies with direct imports. The behavior and both existing reader test suites stay the same.

## Goal

Give the runtime help reader and the generated command-reference reader one implementation of the rule that accepts only regular Markdown files whose resolved paths remain inside the help directory.

## Approach

Move `regularHelpPagePath` from `src/help-pages.ts` into `src/help-page-files.ts` and export it for direct use. Import that function from both `src/help-pages.ts` and `documentation/.vitepress/command-reference.ts` using their existing NodeNext-compatible `.js` import path. Keep directory listing, index-page requirements, rendering, and error handling in their current owners.

The shared function will preserve the existing sequence: resolve the directory, join the candidate filename beneath it, reject a candidate whose `lstat` result is not a regular file, resolve the candidate, then reject a resolved path outside the directory. Filesystem errors continue to return `undefined`.

## Implementation steps

1. Add the focused helper and replace both private implementations with direct imports.
2. Keep the existing runtime and docs-reader tests unchanged; they cover valid regular files, symlink escapes, missing targets, listing, and read behavior.
3. Review the `help` behavior spec and existing help documentation. Since this refactor changes no observable behavior, leave them unchanged.
4. Promote this plan and remove only the resolved PR backlog entry.

## Tests

- `src/help-pages.test.ts` continues to verify regular help-page reads, missing targets, and rejection of symlinks to files outside the help directory.
- `scripts/command-reference.test.mjs` continues to verify listing and rendering behavior and rejection of symlinks to files outside the help directory.
- Run `$janissary/scripts/run.mjs check-diff`, focused server tests for both suites, and `npm run docs:build`.

## Out of scope

- Changing help-page parsing, listing, index validation, rendering, or fallback behavior.
- Changing the help-page security boundary or broadening the set of readable files.
- Changing user documentation or the PR description.
