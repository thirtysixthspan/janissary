# Record React organization debt as a summary bullet with labeled paragraphs

**Complexity: 2/10** — a prompt-document change confined to `ai/tasks/research/find-react-organization-debt.md`: the entry-writing step, the Background passages that describe what an entry has to make visible, the Step 1 dedupe description, Step 6's verification list, and the Step 8 report line.

## Goal

`ai/tasks/research/find-technical-debt.md` recently moved to a structured entry format (commits `d5726b0b`, `6f9bf4ee`, `712ade30`, `7fa24f54`): one unlabeled `*` bullet carrying a glanceable summary, followed by four labeled, blank-line-separated paragraphs at the left margin, with three numeric scores and two blank lines between entries.

```
* <one sentence, glanceable>

Existing Debt: <one sentence> Severity: <N>/10

Existing Risk: <N>/10 - <one sentence>

Proposal Risk: <N>/10 - <one sentence>

Proposal: <the detailed plan, with code references an agent can act on>
```

`find-react-organization-debt.md` still writes the older shape — a single `*` bullet holding one dense paragraph that has to carry the files, the guideline citation, the evidence, the cost, the action, the blast radius, an optional playbook trigger sentence, and a `Severity: **high**` word rating. Both tasks append to the same `## development` section of `product/backlog/technical-debt.md`, so the two shapes sit side by side in one file with two different severity vocabularies.

Adopt the same five-part format here, so entries from either research task read identically and score on the same scales.

What this task records is otherwise unchanged: every entry still names the exact files, cites the guideline section by number and name, states the evidence actually read, states the blast radius, and carries the `improve-modularity.md` trigger sentence for the one class of finding that routes to a playbook.

## Approach

- Rewrite Step 5 around the five parts, distributing what the old one-paragraph bullet had to hold: the summary bullet states the change; `Existing Debt` names the guideline section, the evidence, and the design gap, ending in `Severity: <N>/10`; the two risk paragraphs score what the violation risks if left and what remains once resolved; `Proposal` carries the files, the concrete action, the blast radius, the tests that pin current behavior, and — when routing applies — the trigger sentence as its final sentence.
- Replace the qualitative **high**/**medium**/**low** severity table with the numeric debt-severity scale used by `find-technical-debt.md`, keeping this task's own judgments as the band descriptions (§3 cross-feature imports and §8 layer inversions on churning paths at the top, single stray files and unnecessary `use*` prefixes at the bottom), and add the shared 1–10 risk scale for the two risk scores.
- Keep the routing rules exactly as they are — the same four `improve-modularity.md` blockers, the same verbatim trigger sentence, the same prohibition on inventing a playbook reference — and only state where the sentence now sits, at the end of the `Proposal` paragraph. `ai/tasks/resolve-technical-debt.md` recognizes a hygiene-owned item by the entry *containing* that sentence, so its trigger test keeps working unchanged.
- Because the risk paragraphs now precede the plan they judge, say so in the rules: each risk sentence must stand on its own for a reader who has not yet reached `Proposal`.
- State the entry boundary explicitly. With nothing indented, an entry is no longer one markdown list item — it runs from its `*` bullet through its `Proposal` paragraph, and the next `*` bullet begins the next entry. Two blank lines separate entries; one blank line separates an entry's own parts.
- Rewrite the two worked examples in the new shape, keeping their subject matter: one routed single-file extraction, one hand-planned cross-feature import.
- Update Step 1's dedupe description so it recognizes both shapes present in the backlog file, Step 6's verification list, and Step 8's `Entries:` report line.
- Everything else about the task is unchanged: the guideline it reads against, the tools it must not run, the Step 2 taxonomy and its survey commands, the Step 3 filters, the 6-entry cap and its ranking, the single file it edits, and the quick-commit handoff.

Only `ai/tasks/research/find-react-organization-debt.md` changes.

## Implementation steps

1. Update the opening paragraph so it points at the structured format Step 5 defines.
2. Update the Background bullets: the cost bullet points its lens at `Existing Debt` and the two risk paragraphs; the routing bullet says the trigger sentence closes the `Proposal` paragraph.
3. Update Step 1 so the dedupe set is described in terms of the entry shapes present in the file — the lead `*` bullet of a structured entry, the whole bullet of an older paragraph entry — and so an entry's boundary is stated.
4. Rewrite Step 5: the entry template, a rule per part folding in this task's own requirements (files, guideline citation, evidence, blast radius), the debt-severity scale, the shared risk scale, the rule that the proposal risk must come in materially below the existing risk, the unchanged routing section, and two worked examples in the new shape.
5. Update Step 6's verification so it checks the five parts in order, unindented and blank-line separated, with all three scores present and two blank lines between entries, and so the trigger-sentence check names its position in the `Proposal` paragraph.
6. Update the Step 8 report so the `Entries:` line reads the summary bullet, the guideline section, the debt severity, the existing → proposal risk scores, and whether the entry is routed or hand-planned.

## Tests

None. The change is entirely within an agent prompt document — it has no runtime surface, no importable behavior, and no test hooks; nothing under `src/` or `web/src/` reads the contents of a task file (`src/tasks.ts` lists task files for the task picker and never parses their bodies). `./scripts/run.mjs check-diff` still runs over the diff as a guard.

## Out of scope

- Migrating existing entries in `product/backlog/technical-debt.md`. The `## development` section is currently empty; the entries in `## deferred` and `## declined` are older paragraph-form ones with word severities, and both tasks tell their reader to leave what is already there as written.
- The other research tasks that append to the same backlog with word or paragraph severities — `find-complex-code.md`, `find-namespaces.md`, `find-packages-to-update.md`. The work item names this task only.
- `ai/tasks/resolve-technical-debt.md`, which walks the backlog and speaks of removing or deferring "the item's line". It reads entries as a human would, its trigger test is a containment test, and Step 5 of the rewritten task states the entry boundary explicitly, so it needs no change.
- The routing rules themselves: which findings earn the `improve-modularity.md` trigger sentence, the four blockers it must clear, and the wording of the sentence all stay exactly as written.
- The Step 2 taxonomy, its survey commands, the Step 3 filters, and the Step 4 cap and ranking.
