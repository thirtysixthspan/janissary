# Correct the hosts help note about malformed requests

**Complexity: 1/10** — doc-only one-sentence rewrite, 0 production files, 0 new requirements or test scenarios (p=1.58)

## Goal

Make the Notes section of `help/hosts.md` an accurate statement of the command contract: an unknown verb or a wrong number of operands replies with a usage line, while a structurally valid `hosts add` or `hosts remove` with an invalid name, user, host, port, or path replies with that field's specific diagnostic. Both kinds of refusal leave the catalog untouched.

## Approach

`parseCatalogCommand` in `src/plugins/hosts/catalog-commands.ts` already implements this split. Unknown verbs and bad arity return one of the three `USAGE` constants; structurally valid `add`/`remove` input with an invalid field returns the `validateHostFields` error from `src/plugins/hosts/hosts-values.ts`. `runCatalogCommand` returns a refusal before any read or write, so malformed requests never touch the catalog. The exact diagnostic wording is already recorded in the "Error wording" section of `product/specs/hosts-tab.md`, and the field-error behavior is pinned by the "reports the exact shared diagnostic for each invalid field" case in `src/plugins/hosts/catalog-commands.test.ts`. Only the help prose is wrong; no source, spec, or test change is needed.

## Implementation steps

1. In `help/hosts.md`, replace the first sentence of the **Notes** section — "Malformed requests reply with a usage line and never touch the catalog." — with a sentence that says an unknown verb or a wrong number of operands replies with a usage line, while an invalid name, user, host, port, or path replies with the field-specific diagnostic (`Invalid <field> …`) named in `product/specs/hosts-tab.md`, and that neither kind of refusal touches the catalog.
2. Leave the following sentence about hosts-file problems unchanged, and keep every other line of `help/hosts.md` byte-for-byte unchanged.

## Tests

No new tests. The fix changes documentation only; behavior is unchanged. Existing coverage in `src/plugins/hosts/catalog-commands.test.ts` already pins the contract the note now describes: "refuses unknown verbs and list operands", "refuses malformed add and remove arity", "reports the exact shared diagnostic for each invalid field", and "skips storage for malformed requests". Verify the change with `$janissary/scripts/run.mjs check-diff`.

## Out of scope

- No change to `src/plugins/hosts/catalog-commands.ts`, `src/plugins/hosts/hosts-values.ts`, or their tests.
- No change to `product/specs/hosts-tab.md` — its "Error wording" and "Commands" sections already state the correct behavior.
- No change to `help/commands.md`, `help/keys.md`, or anything under `documentation/user-documentation/`.
- No change to the pull request's title or description.
