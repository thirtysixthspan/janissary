# Record technical debt as Proposal, Debt, Refactor, and Risks

**Complexity: 2/10** — a prompt-document change confined to `ai/tasks/research/find-technical-debt.md`: the entry-writing step, the two Background passages that name the entry's fields, the Step 1 dedupe description, Step 5's verification list, and the Step 7 report line.

## Goal

Replace the entry format `ai/tasks/research/find-technical-debt.md` writes today — **Summary**, **Benefits**, **Complexity**, **Proposal**, **Risks** — with a four-field format that centers the reader's real question: how bad is this now, and how much better does the refactor make it?

Field contracts:

- **Proposal** — one sentence summarizing the entire proposal, readable at a glance.
- **Debt** — one sentence summarizing the existing technical debt within the proposal's scope, plus a debt severity score on a 10-point scale.
- **Refactor** — a detailed plan with code references sufficient for an AI agent to pick the entry up and execute the refactor successfully.
- **Risks** — one sentence on the risk the debt represents if it is not resolved, with an existing risk score on a 10-point scale; one sentence on the risk of performing the refactor; and one sentence on the risk carried by the code in its newly refactored state, with a proposed risk score on a 10-point scale.

The two risk scores are the point of the format: an entry that cannot show a lower proposed score than its existing score has not justified the work. **Benefits** and **Complexity** are dropped — the benefit is now visible as the drop from existing to proposed risk, and `ai/tasks/resolve-technical-debt.md` rates complexity itself when it walks the backlog.

**Reading the field list.** The work item names the fields as `Proposal, Debt, Refactor, Risks` and then describes "Proposal" twice: once as the one-sentence glanceable summary and once as the detailed plan with code references. The second description is the **Refactor** field — it is the only field in the list left otherwise undescribed, and the detailed plan is what a refactor field holds. This plan implements that reading.

## Approach

- Rewrite Step 4 around the four fields: a rendering template (one `*` bullet carrying the Proposal, three indented sub-bullets, with Risks carrying three labeled parts), a rule per field, two 10-point scales (debt severity, risk), the existing-versus-proposed comparison rule, and a worked example.
- Point the **Refactor** field explicitly at its audience: the entry is a handoff to an agent that will not have done the reading, so it names files, functions, and call sites by path and says what changes in each.
- Update the two Background bullets that name fields (`Benefits`/`Complexity`) to name `Debt` and the risk pair instead.
- Update Step 1's description of entry shapes, Step 5's per-entry verification, and Step 7's report line to match the new field names and scores.
- Everything else about the task is unchanged: what it reads, the tools it must not run, the 10-entry cap, the single file it edits, and the quick-commit handoff.

Only `ai/tasks/research/find-technical-debt.md` changes. The sibling research tasks (`find-complex-code.md`, `find-namespaces.md`, `find-react-organization-debt.md`, `find-packages-to-update.md`) also append to `product/backlog/technical-debt.md` with severity-bearing paragraphs and are deliberately left alone — the work item names this task only.

## Implementation steps

1. Update the Background bullets: the Fowler-quadrant bullet points its lens at the **Debt** and **Risks** fields; the prioritization bullet weighs the debt severity against the existing-to-proposed risk drop rather than against Benefits and Complexity.
2. Update Step 1 so the dedupe set is described in terms of the entry shapes present in the file — the lead Proposal line of a structured entry, the whole bullet of an older paragraph entry.
3. Rewrite Step 4: the entry template, the four field rules, the debt severity scale, the risk scale shared by both risk scores, the rule that the proposed score must come in below the existing one, and a worked example. Remove the Summary/Benefits/Complexity rules and the complexity scale.
4. Update Step 5's verification so it checks all four fields, in order, with both scores present.
5. Update the Step 7 report so the `Entries:` line reads the Proposal sentence, the debt severity, and the existing → proposed risk scores.

## Tests

None. The change is entirely within an agent prompt document — it has no runtime surface, no importable behavior, and no test hooks; nothing under `src/` or `web/src/` reads the contents of a task file (`src/project-init.ts` creates `product/backlog/technical-debt.md` with empty sections and never parses entries). `./scripts/run.mjs check-diff` still runs over the diff as a guard.

## Out of scope

- Migrating the existing entries in `product/backlog/technical-debt.md` to the new format.
- `product/plans/complete/structured-technical-debt-entries.md`, which recorded the Summary/Benefits/Complexity format this plan supersedes — completed plans stay as the historical record of what shipped and are not rewritten.
- The severity ratings written by the other research tasks under `ai/tasks/research/`.
- `ai/tasks/resolve-technical-debt.md`, which walks the backlog and speaks of removing or deferring "the item's line" — it reads entries as a human would and needs no change to handle a Proposal bullet with indented fields.
- The `## ready` / `## development` / `## deferred` / `## declined` section structure of the backlog file.
