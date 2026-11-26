<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Remove the duplicated literal-alias check in the managed-section module by reusing the tokenizer's existing predicate.

Existing Issue: The new `outsideLiteralAliases` in `src/plugins/hosts/ssh-config/section.ts` re-implements the literal-host-name test inline while the sibling `src/plugins/hosts/ssh-config/parse.ts` already defines the identical rule as `isLiteralName`, so the definition of a literal alias now lives in two places that can drift. Severity: 3/10

Existing Risk: 3/10 - If the literal-name rule is ever extended, the outside-alias clash list consumed by the export operation can disagree with the alias reader and let a host be written into the managed section while an outside block still claims the same name, shadowing the managed definition.

Proposal Risk: 1/10 - With one shared predicate the two paths cannot diverge, and the only remaining risk is the mechanical import change, which the two modules' existing tests already pin.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2242 "share the literal SSH alias predicate between section.ts and parse.ts". Export the existing `isLiteralName` predicate from `src/plugins/hosts/ssh-config/parse.ts` and import it from `./parse.js` in `src/plugins/hosts/ssh-config/section.ts`, replacing the inline `name === '' || name.includes('*') || name.includes('?') || name.startsWith('!')` exclusion in `outsideLiteralAliases` with a call to that shared predicate. Keep the case-insensitive first-spelling `seen` logic in `outsideLiteralAliases` unchanged; this is a refactor that removes a second definition, not a change to which names count as literal. Verify against the existing `src/plugins/hosts/ssh-config/parse.test.ts` and `src/plugins/hosts/ssh-config/section.test.ts`, which already cover literal, wildcard (`Host web*`), negated, and empty names; add a cross-module case only if one is missing.
