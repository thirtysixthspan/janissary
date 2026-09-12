# Fix the pdf-text-layer stylelint errors on master

**Complexity: 1/10** — three blank lines added to one CSS file, satisfying two rules the project's stylelint config deliberately keeps enabled. No selectors, properties, or values change; nothing renders differently. The number is not lower because the fix has to be the blank lines rather than a config exemption, and that choice needs stating.

Work item, as named at invocation: *"fix the pdf errors on master"*. Not listed in `./product/backlog/issues.md`, which is empty.

`web/src/plugins/pdf/pdf-text-layer.css` fails `npm run lint:css` on master:

```
28:3  ✖  Expected empty line before custom property  custom-property-empty-line-before
54:3  ✖  Expected empty line before custom property  custom-property-empty-line-before
57:3  ✖  Expected empty line before declaration      declaration-empty-line-before
```

It is the only file under `web/src/**/*.css` that fails, and it arrived with the bundled PDF viewer plugin. The reason it went unnoticed is that `npm run lint:css` is not part of `npm run check` — it runs only in `check:full` and `lint:all`, and CI's workflow does not invoke it either.

## Scope

"The pdf errors" is these three and only these three. The rest of the plugin is clean on master, confirmed rather than assumed:

- `npx eslint web/src/plugins/pdf src/plugins` — no errors.
- Client tests: 6 files, 48 tests, all passing.
- Server tests: 2 files, 20 tests, all passing.

## Design decisions

- **Fix the CSS, not the config.** `custom-property-empty-line-before` and `declaration-empty-line-before` are both left on in `web/.stylelintrc.json`, which switches off five other standard rules explicitly (`rule-empty-line-before`, `comment-empty-line-before`, and three more). Those two surviving the cut is a decision the project already made; one file arriving that does not follow it is the file's problem, not the rule's. Every other stylesheet under `web/src/` conforms.
- **No exemption for a derived stylesheet.** The file's header comment records that its geometry is derived from the text-layer rules `pdfjs-dist` ships, but the file is hand-restated rather than vendored — it is rooted in this plugin's own class and drops the viewer-application rules wholesale. It is project-authored CSS and is held to project formatting.
- **Blank lines placed to group, not merely to satisfy.** In `.pdf-text-layer`, the blank line separates the standard properties from the block of five custom properties the header comment describes. In the glyph-run rule, one blank line opens the three PDF.js-written custom properties and another closes them before the two declarations that consume them — so the grouping the file already explains in prose becomes visible.
- **Written by hand, not by `--fix`.** `stylelint --fix` would insert the same three lines, but the placement above is a grouping decision; applying it directly keeps the result reviewable as an intent rather than as tool output.

## Proposed changes

- `web/src/plugins/pdf/pdf-text-layer.css` — three blank lines:
  1. Before `--scale-round-x` in `.pdf-text-layer`, separating the custom-property block from the standard properties above it.
  2. Before `--font-height` in the glyph-run rule.
  3. Before `font-size` in that same rule, closing the custom-property block.

No other file changes. No source, no tests, no protocol, no docs.

## Tests

None to add. This is whitespace in a stylesheet with no rendered difference and no runtime behavior to assert; the existing 68 PDF plugin tests already cover the plugin's behavior and must keep passing untouched. The executable check for this change is `npm run lint:css` itself, which is the gate that currently fails.

## Out of scope

- Adding `lint:css` to `npm run check` or to the CI workflow, which is the reason this reached master and is a change to the project's gating rather than to the PDF plugin. Reported, not fixed here.
- `CLAUDE.md`'s description of `npm run check` as including CSS linting, which no longer matches `package.json`.
- Any change to the stylelint config, to the PDF plugin's behavior, or to the rules in this stylesheet.

## Verification

- `npx stylelint "web/src/**/*.css"` — clean.
- `./scripts/run.mjs check-diff`
