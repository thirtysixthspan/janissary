# Report technical debt findings in a structured entry format

**Complexity: 2/10** — a prompt-document change confined to `ai/tasks/research/find-technical-debt.md`: the entry-writing step, the passages that describe what an entry looks like, and the report shape.

## Goal

Have `ai/tasks/research/find-technical-debt.md` record each finding as a structured entry with five named fields — **Summary**, **Benefits**, **Complexity**, **Proposal**, **Risks** — instead of the single free-form paragraph ending in a severity rating that it asks for today.

The current one-paragraph bullet mixes the symptom, the cause, the affected files, and the fix into one block of prose, so a reader has to parse the whole paragraph to answer the two questions they actually open the backlog with: *what is this, and is it worth picking up now?* The five fields separate the glanceable part (Summary, Benefits, Complexity) from the detail needed to act (Proposal, Risks), and replace the qualitative severity rating with a 1–10 complexity score — the same scale `ai/tasks/resolve-technical-debt.md` applies when it walks the backlog and decides what to resolve versus defer.

Field contracts:

- **Summary** — one sentence describing the proposed change, readable at a glance, capturing the scope of the work, and naming no files.
- **Benefits** — one sentence stating the specific benefits the change achieves.
- **Complexity** — a score from 1 to 10.
- **Proposal** — a detailed plan naming the specific modules, files, directories, and functions to be changed.
- **Risks** — one sentence stating the specific risks the proposal carries.

## Approach

- Rewrite Step 4 around the five fields: a rendering template (one `*` bullet carrying the Summary, four indented sub-bullets carrying the rest), a rule per field, a 1–10 complexity scale, and a worked example replacing the current prose-bullet guidance.
- Replace the severity rating with the complexity score wherever the document refers to it — the Background prioritization lens, Step 4's rating table, and the Step 7 report line.
- Keep the requirement that entries name concrete files, moving it from the paragraph rule to the **Proposal** field, and keep the Summary file-free per the field contract.
- Leave Step 1's dedupe rule working against a file that now holds both shapes — existing single-paragraph bullets and new structured entries — since the older entries are not migrated.
- Everything else about the task is unchanged: what it reads, the tools it must not run, the 10-entry cap, the single file it edits, and the quick-commit handoff.

Only `ai/tasks/research/find-technical-debt.md` changes. The sibling research tasks (`find-complex-code.md`, `find-namespaces.md`, `find-react-organization-debt.md`, `find-packages-to-update.md`) also append to `product/backlog/technical-debt.md` with severity-bearing paragraphs and are deliberately left alone — the work item names this task only.

## Implementation steps

1. Update the "Your job" line so findings are logged as structured entries in the format Step 4 defines.
2. Update the Background section: the Fowler-quadrant bullet points its lens at whether a candidate is worth logging and at what the Benefits and Risks fields say, rather than at a severity rating; the prioritization bullet weighs impact against the recorded Complexity score.
3. Update Step 1 so the dedupe set is described in terms of both entry shapes present in the file — the Summary line of a structured entry, the whole bullet of an older paragraph entry.
4. Rewrite Step 4: the entry template, the five field rules, the 1–10 complexity scale with anchors, the note that `resolve-technical-debt.md` defers anything above 7, and a worked example. Remove the severity table.
5. Update Step 5's verification wording from "new bullets" to "new entries" so the multi-line shape is covered.
6. Update the Step 7 report so the `Entries:` line reads one line per new entry: its Summary and complexity.

## Tests

None. The change is entirely within an agent prompt document — it has no runtime surface, no importable behavior, and no test hooks; nothing under `src/` or `web/src/` reads the contents of a task file (`src/project-init.ts` creates `product/backlog/technical-debt.md` with empty sections and never parses entries). `./scripts/run.mjs check-diff` still runs over the diff as a guard.

## Out of scope

- Migrating the existing entries in `product/backlog/technical-debt.md` to the new format.
- The severity ratings written by the other research tasks under `ai/tasks/research/`.
- `ai/tasks/resolve-technical-debt.md`, which walks the backlog and speaks of removing or deferring "the item's line" — it reads entries as a human would and needs no change to handle a Summary bullet with indented fields.
- The `## ready` / `## development` / `## deferred` / `## declined` section structure of the backlog file.
