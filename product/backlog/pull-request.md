<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the hosts help note's claim that malformed requests reply with a usage line.

Existing Issue: `help/hosts.md` says in its Notes that malformed requests reply with a usage line, but a structurally valid `hosts add` or `hosts remove` with an invalid field returns that field's specific diagnostic instead. Severity: 2/10

Existing Risk: 2/10 - A user who types a bad port or illegal name expects a usage line and is confused by the field error, and the help page stops being a reliable statement of the command contract.

Proposal Risk: 1/10 - The note then distinguishes verb and arity usage errors from field validation errors, leaving only the chance that a later wording change in either the help or the command drifts them apart again.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2092 "correct the hosts help note about malformed requests". In `help/hosts.md`, rewrite the Notes sentence so it says unknown verbs and wrong operand counts reply with a usage line while invalid names, users, hosts, ports, and paths reply with the field-specific diagnostic named in `product/specs/hosts-tab.md`, and that neither touches the catalog. Keep the rest of the page unchanged. Verify against `src/plugins/hosts/catalog-commands.ts` (`parseAdd` and `parseRemove`) and the "reports the exact shared diagnostic for each invalid field" case in `src/plugins/hosts/catalog-commands.test.ts`, which pins the field-error behavior; no source change is needed.
