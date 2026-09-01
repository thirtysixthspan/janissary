# Record technical debt as a summary bullet with labeled paragraphs

**Complexity: 2/10** — a prompt-document change confined to `ai/tasks/research/find-technical-debt.md`: the entry-writing step, the two Background passages that name the entry's fields, the Step 1 dedupe description, Step 5's verification list, and the Step 7 report line.

## Goal

Replace the nested entry format `ai/tasks/research/find-technical-debt.md` writes today — a `**Proposal:**` bullet with indented `**Debt:**`, `**Refactor:**`, and `**Risks:**` sub-bullets, the last carrying three labeled parts of its own — with a flat format: one unlabeled `*` bullet carrying the entry's summary, followed by four labeled, blank-line-separated paragraphs at the left margin.

The target shape:

```
* <one sentence, glanceable>

Existing Debt: <one sentence> Severity: <N>/10

Existing Risk: <N>/10 - <one sentence>

Proposal Risk: <N>/10 - <one sentence>

Proposal: <the detailed plan, with code references an agent can act on>
```

Three changes are folded into that shape:

- **The nesting goes away.** Sub-bullets indented under a parent bullet, and labeled parts indented under those, made an entry three levels deep and hard to read as plain text. Every part now sits flush left, separated by blank lines, with plain-text labels rather than bold ones.
- **The names shift by one.** What the old format called `Proposal` — the glanceable one-liner — becomes the unlabeled `*` bullet. `Proposal` now labels the detailed plan with code references, which the old format called `Refactor`. `Debt` becomes `Existing Debt` and carries its score as a trailing `Severity: N/10` instead of an em-dashed suffix. The two risk parts become their own top-level paragraphs, `Existing Risk` and `Proposal Risk`, each leading with its score.
- **The refactoring risk is dropped.** The old `Risks` block carried a third, unscored part describing what could go wrong *while* performing the refactor. The new format has no place for it: the two scored risks — the risk of leaving the debt and the risk that survives the work — are the case for the entry, and the mid-refactor hazards belong in the Proposal paragraph beside the step that creates them.

What the entry records is otherwise unchanged: the same three scores on the same two scales, the same requirement that the proposal risk come in materially below the existing risk, and the same demand that the detailed plan name files by path for an agent opening the entry cold.

## Approach

- Rewrite Step 4 around the five parts: a rendering template, a rule per part, the two 10-point scales, the existing-versus-proposal comparison rule, and a worked example in the new shape.
- Because the two risk paragraphs now precede the plan they judge, say so in the rules: each risk sentence must stand on its own to a reader who has not yet reached the Proposal paragraph.
- State the entry boundary explicitly. With nothing indented, an entry is no longer one list item — it runs from its `*` bullet through its Proposal paragraph, and the next `*` bullet starts the next entry. Step 1's dedupe description and Step 5's verification both depend on that boundary being written down.
- Update the two Background bullets that name fields (`Debt`, `Risks`) to name `Existing Debt`, `Existing Risk`, and `Proposal Risk`.
- Update Step 1's description of entry shapes, Step 5's per-entry verification, and Step 7's report line to match the new part names.
- Everything else about the task is unchanged: what it reads, the tools it must not run, the 10-entry cap, the single file it edits, and the quick-commit handoff.

Only `ai/tasks/research/find-technical-debt.md` changes. The sibling research tasks (`find-complex-code.md`, `find-namespaces.md`, `find-react-organization-debt.md`, `find-packages-to-update.md`) also append to `product/backlog/technical-debt.md` with severity-bearing paragraphs and are deliberately left alone — the work item names this task only.

## Implementation steps

1. Update the Background bullets: the Fowler-quadrant bullet points its lens at the `Existing Debt` and risk paragraphs; the prioritization bullet weighs the debt severity against the drop from `Existing Risk` to `Proposal Risk`.
2. Update Step 1 so the dedupe set is described in terms of the entry shapes present in the file — the lead `*` bullet of a structured entry, the whole bullet of an older paragraph entry — and so a structured entry is recognized as a bullet followed by labeled paragraphs rather than by indented sub-bullets.
3. Rewrite Step 4: the entry template, the five part rules, the debt severity scale, the risk scale shared by both risk scores, the rule that the proposal score must come in below the existing one, and a worked example. Remove the sub-bullet template, the `Refactor` field rule, and the `Refactoring` risk rule.
4. Update Step 5's verification so it checks the five parts, in order, unindented and blank-line separated, with all three scores present, and so it names the entry boundary a reader uses to tell one entry from the next.
5. Update the Step 7 report so the `Entries:` line reads the summary bullet, the debt severity, and the existing → proposal risk scores.

## Tests

None. The change is entirely within an agent prompt document — it has no runtime surface, no importable behavior, and no test hooks; nothing under `src/` or `web/src/` reads the contents of a task file (`src/project-init.ts` creates `product/backlog/technical-debt.md` with empty sections and never parses entries). `./scripts/run.mjs check-diff` still runs over the diff as a guard.

## Out of scope

- Migrating the existing entries in `product/backlog/technical-debt.md` to the new format. The `## development` section is currently empty; the entries in `## deferred` and `## declined` are older paragraph-form ones the task already tells its reader to leave as written.
- `product/plans/complete/technical-debt-proposal-debt-refactor-risks.md` and `product/plans/complete/structured-technical-debt-entries.md`, which recorded the formats this plan supersedes — completed plans stay as the historical record of what shipped and are not rewritten.
- The severity ratings written by the other research tasks under `ai/tasks/research/`.
- `ai/tasks/resolve-technical-debt.md`, which walks the backlog and speaks of removing or deferring "the item's line". It reads entries as a human would, and Step 5 of the rewritten task now states the entry boundary explicitly, so it needs no change to handle a summary bullet trailed by labeled paragraphs.
- The `## ready` / `## development` / `## deferred` / `## declined` section structure of the backlog file, and the task's description of it as three sections when the file carries four.
