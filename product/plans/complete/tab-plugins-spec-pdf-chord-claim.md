# Name the PDF plugin's Cmd+F chord claim in the tab-plugins spec

**Complexity: 1/10** — spec prose only, two sentences in one file. The claim already ships in `src/plugins/pdf/manifest.ts` and is pinned by `src/plugins/declaration-validation.test.ts`.

## Goal

The PDF manifest now declares `chords: ['meta+f']`, but `product/specs/tab-plugins.md` still says otherwise in two places. § Bundled shell plugin calls the shell plugin "the only one that claims a chord". § Bundled PDF plugin lists the `.pdf` extension, both `open` presentations, `pdf <path>`, and the load-failure intent, and never mentions the chord. A contributor trusting the spec could change the chord registry, claim validation, or `meta+f` routing as if only the shell used them, and break PDF find with no spec line to warn them.

## Approach

Correct the shell sentence so it stays true with two chord claimants, and add one sentence to the PDF section naming the claim and its scope. Link [[pdf-tab]] § Find for the find behavior rather than restating it.

Verified against the code:

- `src/plugins/pdf/manifest.ts` declares `chords: ['meta+f']`. Its comment says the claim is honoured only while a PDF tab is the active one, that the chord runs for the focused tab label, and that the application keeps `Cmd+F` everywhere else.
- `src/plugins/shell/manifest.ts` declares `chords: ['ctrl+r', 'meta+t', 'meta+f']`, so the shell is still the first plugin to claim a chord but no longer the only one.
- `src/plugins/declaration-validation.test.ts` asserts both chord lists.

## Implementation steps

1. In `product/specs/tab-plugins.md` § Bundled shell plugin, replace "and the only one that claims a chord" with "and the first one to claim a chord". Leave the rest of that sentence and the later `Ctrl+R` paragraph unchanged.
2. In § Bundled PDF plugin, after the first paragraph listing its contributions, add one sentence: the plugin also claims `Cmd+F` (`meta+f` in its declaration) to find text in the document, the claim holds only while a PDF tab is the active one and is answered only for the focused tab label, so the application keeps the chord everywhere else, with a link to [[pdf-tab]] § Find.
3. Run `$janissary/scripts/run.mjs check-diff`.

## Tests

No new tests. Nothing changes in the code. The claim this spec now names is already pinned by `src/plugins/declaration-validation.test.ts`, which asserts `pdfManifest.chords` equals `['meta+f']` and `shellManifest.chords` equals `['ctrl+r', 'meta+t', 'meta+f']`. `src/plugins/documentation.test.ts` reads `product/specs/tab-plugins.md` and must stay green. `$janissary/scripts/run.mjs check-diff` confirms both.

## Out of scope

- Any change to the PDF or shell manifests, the chord registry, or claim validation.
- The shell section's `Ctrl+R` paragraph, which describes only that chord and stays as written.
- `product/specs/pdf-tab.md` § Find, which already describes the find behavior.
- The pull request description, and every other entry in `product/backlog/pull-request.md`.

## Verification

- `$janissary/scripts/run.mjs check-diff`
- Read the two edited passages against `src/plugins/pdf/manifest.ts` and `src/plugins/shell/manifest.ts`.
