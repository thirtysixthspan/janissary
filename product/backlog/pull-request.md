<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Handle the functionality gap where a non-decimal ssh Port is silently converted instead of skipped.

Existing Issue: `acceptedHost` in `src/plugins/hosts/import-ssh.ts` passes `Number(alias.port)` into `formatDestination` before `validateHostFields` sees the value, so an alias such as `Port 1e2` or `Port 0x10` becomes a valid numeric port instead of being rejected as a value that cannot be expressed as a saved host. Severity: 4/10

Existing Risk: 4/10 - An alias the saved-host rules should skip is imported with a port the user never wrote, so launching it reaches a different service than the ssh config specified.

Proposal Risk: 2/10 - After a decimal-only guard the alias is skipped and counted like every other invalid record, while the plain-decimal path is unchanged.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2242 "skip ssh aliases whose effective Port is not plain decimal". In `src/plugins/hosts/import-ssh.ts`, before building the destination in `acceptedHost`, return `undefined` when `alias.port !== ''` and the value fails a `/^[0-9]+$/` test, leaving the existing `Number` conversion in place for accepted decimal values; `validateHostFields` and `splitDestination` in `src/plugins/hosts/hosts-values.ts` already reject non-decimal and out-of-range ports, so they need no change. Add a case to `src/plugins/hosts/import-ssh.test.ts` with one ordinary alias and one carrying `Port 1e2` (and, if useful, `Port 0x10`), asserting the ordinary host is written, the odd-port alias is absent, the skipped count is incremented, and the summary carries the `; skipped 1.` clause. Requirements 15 and 18 of the feature plan and the spec statement that aliases which cannot be expressed as saved hosts are skipped define the behavior being restored. The existing `Port abc` case, the bracketed-alias case, and the singular and plural summary cases must keep passing untouched; the hazard to watch is rejecting a legitimate leading-zero decimal port, which a colocated decimal case should pin.
