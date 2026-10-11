# Repair the failing documentation build

**Complexity: 2/10** — two lines in two Markdown files, each correcting a mistake that made `npm run docs:build` fail on a page it had been failing on since before this pull request. No code, no test, no spec: both defects are in prose, and the build is the test.

`npm run docs:build` failed with two errors. Both are pre-existing — each reproduces on a clean tree, and neither page was touched by this pull request except for the Roles one, which arrived with it. Fixing them was never in scope for the review backlog this branch carries, and the failure was recorded rather than absorbed until someone asked for it.

**`documentation/user-documentation/tab-types/diff.md`** — `Element is missing end tag` at line 9, column 60. The sentence read ``titled **diff: <workspace label>**``. CommonMark parses `<workspace label>` as valid inline HTML: `workspace` is a legal tag name and `label` is a legal valueless attribute, so markdown-it emits the text unescaped. Vue then compiles the page's template, sees an element named `workspace` that is never closed, and fails the build. The column in the error names it exactly: position 60 of the rendered `<p>` is the `<` of that placeholder. Code spans are escaped by markdown-it and never reach the template, which is why the same file's `` `diff <path>` `` on the previous line and every fenced usage block in the documentation are fine.

**`documentation/user-documentation/tab-types/roles.md`** — `Could not resolve '/agents/emrah-south-east.png'`. The roster `copyAgentImages()` serves is the seventeen characters in `agent-images/`, listed in `ai/guidelines/documentation.md`: there is no `emrah` directory, so no build will ever produce that file. The reference was wrong the moment the page was written; the rest of the documentation referenced only roster characters, which is why this was the single unresolved image.

## Goal

- `npm run docs:build` completes.
- The placeholder in the diff page renders as the placeholder it is meant to be, rather than as a tag the template compiler tries to balance.
- The Roles page floats a character the roster actually serves, and none of the page's three sprites is a stranger to the pages around it.

## Design decisions

- **A code span for the placeholder, keeping the bold.** The sentence's emphasis is on the tab's title pattern, so the bold stays and the placeholder becomes inline code — the same treatment `` `diff <path>` `` two lines above already gets. Escaping with `&lt;` would render identically and read worse in the source; rewriting the sentence to avoid brackets would lose the shape readers compare against a real tab title.
- **A roster character that fits the page's rotation.** `mahir` is not already on the Roles page (`dogan` and `idris` are), not on the preceding page in sidebar order (`conversations` uses bilal, demir, and yusuf), and carries the `south-east` facing this line already asked for, which `FACINGS` in `documentation/.vitepress/config.mts` copies. The `agent-float left` class is unchanged, so the page's layout is what the author drew.
- **The generator is not touched.** A missing sprite is a wrong reference, not a missing build step: the roster is seventeen characters by decision, `agent-images/` has no `emrah`, and inventing one is not this change.
- **No documentation-scanning test.** A guard that rejects a raw `<tag` in prose would need its own fenced-code and inline-code parser to avoid flagging the hundreds of usage lines the documentation is full of, and no such scanner exists here today. The build already fails loudly on the real case; the remaining risk is a typo that produces a *valid* tag name, which this fix does not address either way.

## Implementation steps

1. **`documentation/user-documentation/tab-types/diff.md`.** Make `<workspace label>` an inline code span inside the existing bold.
2. **`documentation/user-documentation/tab-types/roles.md`.** Point the second sprite at `mahir-south-east.png`.
3. **`product/plans/complete/document-roles-in-the-default-launcher-command-rail.md`.** Correct its note that the build could not verify the launcher's new Roles link — it can now, and the file is on this branch.

## Tests

None added. Both defects are in prose, and the failing build was the test: it goes red on either line and green once both are fixed, on every page in the site.

## Out of scope

- The `<placeholder>`-in-prose trap in future documentation. Guarding it is a scanner of its own, described above and not built here.
- Every other page's prose. The build now renders all of them, which is the proof that no other page has either defect.
- `ai/guidelines/documentation.md`, the roster, and `FACINGS`, all of which are correct as written.

## Verification

- `npm run docs:build` completes, reporting `build complete`.
- The rendered diff page shows the placeholder as text inside the bold, and the rendered Roles page carries an `img` the build resolved.
- `documentation/.vitepress/dist/user-documentation/tab-types/launcher.html` links to `roles.html`, which the build produced — the check the launcher plan had to defer.