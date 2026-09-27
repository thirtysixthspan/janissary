# Remove the unused export and the test that asserted nothing

**Complexity: 1/10** — one deleted export line, one deleted test block, and one replacement assertion that is stronger than the pair it replaces.

Two recorded findings about the same kind of thing: a surface that exists only to be looked at, and a green mark standing in for a check. The first is `SOURCE_LIMITS` in `src/visualizations/fetch.ts`, which nothing reads. The second is a test block in `web/src/plugins/visualizations/visualizations-style.test.ts` asserting that an export is a function, which forced that export into existence in the first place.

## Design decision

The replacement assertion is worth more than either. An export resolves a fixed list of theme custom properties before rasterizing the chart, and a chart that paints a property the export does not resolve comes out as whatever the browser defaults to — a black rectangle, not a failure.

The first version of the new assertion scanned only the stylesheet, and it immediately failed: the mark and axis modules use three properties the stylesheet does not, so a stylesheet-only check would have passed while those three exported wrong. That is the argument for the shape it ended up in.

So the assertion scans every module that names a colour — the stylesheet for the chrome and the four chart modules for the marks — and compares the union against the list the export resolves. It is a comparison of two lists, needs no DOM, and is the check that would actually have caught the drift it was written for.

`chartProperties()` is a getter rather than the constant, so the list is readable by a test without being mutable by one.

## Implementation steps

1. Delete the `SOURCE_LIMITS` export from `src/visualizations/fetch.ts`; the three constants stay private, each already used at its own use site.
2. Make `withResolvedColours` module-private in `web/src/plugins/visualizations/export/download.ts` and give the list a `chartProperties()` getter.
3. Replace the empty test block in `web/src/plugins/visualizations/visualizations-style.test.ts` with the union comparison.

## Tests

- `web/src/plugins/visualizations/visualizations-style.test.ts`: the chart paints with exactly the properties the export resolves. Adding a colour to one side and not the other now fails, which is the whole point.
- `src/visualizations/fetch.test.ts` keeps passing unchanged; it already passes its own `maxBytes` and `timeoutMs` through the options, so it never depended on the deleted export.

## Out of scope

- Any change to the bounds themselves. The constants, their values, and where they are enforced are untouched.
- Testing `withResolvedColours` against a real `getComputedStyle`. That needs a rendered document, and the property-name pairing is the part that can drift; how a browser resolves a custom property is not.

## Verification

`./scripts/run.mjs check-diff`.
