<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the stale saved-host comment that claims the unusable-file report is forwarded to the origin's transcript.

Existing Issue: The comment above `resolveRemoteLaunchAddress` in `src/remote/saved-host.ts` says the catalog's deduplicated unusable-file report is forwarded to the origin's transcript, while the code posts it as a manual notification to the notifications feed as `product/specs/ssh-tab.md` requires. Severity: 2/10

Existing Risk: 3/10 - A maintainer who trusts the comment can "fix" the forwarding into a transcript append, breaking the documented rule that the notice never enters a tab's transcript.

Proposal Risk: 1/10 - The comment then agrees with the code and the spec, leaving only the ordinary chance that a later edit to the notify path drifts the comment again.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2092 "correct the stale saved-host unusable-file notification comment". In `src/remote/saved-host.ts`, rewrite the comment above `resolveRemoteLaunchAddress` that currently says the report "is forwarded to the origin's transcript" so it states the report is posted as a manual notification attributed to the caller label into the notifications feed and is never written into a transcript, matching `product/specs/ssh-tab.md`. Do not change behavior: the function already calls `notify(managers, 'manual', originLabel, message)`. `src/remote/saved-host.test.ts` pins that notify call and the once-per-problem message and must keep passing unchanged.


* Correct the pull request title's docs-only claim, which does not describe the full hosts feature the diff ships.

Existing Issue: The pull request is titled "docs(plans): rework the hosts tab implementation sequence" although the diff delivers the entire saved-hosts feature across implementation, specs, help, and UI. Severity: 3/10

Existing Risk: 3/10 - A reader triaging by conventional-commit type treats this as a documentation-only change and may approve a large feature without the scrutiny a `feat` would attract.

Proposal Risk: 1/10 - The title then matches the body and the diff, with the body already describing the shipped behavior correctly; the only remaining risk is a future title that drifts from the change again.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2092 "correct the pull request title to describe the hosts feature". Retitle pull request 2092 to name the delivered change, for example "feat(hosts): add saved hosts and the Hosts tab", so the conventional-commit type and scope match the implementation, specs, help, and UI in the diff. Leave the body intact: its What, Behavior examples, Screenshots, and How to verify sections already describe the behavior the code delivers. No source edit is involved; verify by re-reading `gh pr view 2092 --json title,body` and confirming the title names the feature.


* Correct the hosts help note's claim that malformed requests reply with a usage line.

Existing Issue: `help/hosts.md` says in its Notes that malformed requests reply with a usage line, but a structurally valid `hosts add` or `hosts remove` with an invalid field returns that field's specific diagnostic instead. Severity: 2/10

Existing Risk: 2/10 - A user who types a bad port or illegal name expects a usage line and is confused by the field error, and the help page stops being a reliable statement of the command contract.

Proposal Risk: 1/10 - The note then distinguishes verb and arity usage errors from field validation errors, leaving only the chance that a later wording change in either the help or the command drifts them apart again.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2092 "correct the hosts help note about malformed requests". In `help/hosts.md`, rewrite the Notes sentence so it says unknown verbs and wrong operand counts reply with a usage line while invalid names, users, hosts, ports, and paths reply with the field-specific diagnostic named in `product/specs/hosts-tab.md`, and that neither touches the catalog. Keep the rest of the page unchanged. Verify against `src/plugins/hosts/catalog-commands.ts` (`parseAdd` and `parseRemove`) and the "reports the exact shared diagnostic for each invalid field" case in `src/plugins/hosts/catalog-commands.test.ts`, which pins the field-error behavior; no source change is needed.
