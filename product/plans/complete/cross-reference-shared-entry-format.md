# Cross-reference the two task files that share an entry format

**Complexity: 2/10** — one sentence added to each of two markdown task files. No source, no test, no protocol, no UI.

## Goal

`ai/tasks/pull-request-review.md` and `ai/tasks/research/find-technical-debt.md` both define the same entry shape: a `*` summary bullet, four labeled paragraphs, two 1–10 scales, a two-blank-lines separator between entries, and the "write the `Proposal` for an agent that has not read the code, by path and never by line number" standard. Neither file mentions the other. The two copies are kept in step only by whoever happens to remember both exist.

They have already drifted. The risk table is byte-identical in both; the severity table's three bands are not, because one was rewritten for pull-request review. That particular divergence is deliberate — but nothing recorded it as deliberate, and it took a review of the pull request that introduced it to notice.

## Approach

The restatement itself stays. `product/plans/complete/pull-request-review.md` argues that a task file must stand alone rather than send its reader to another file mid-run, and that reasoning holds: an agent executing a task should not have to open a second document to learn the format it is writing in.

What is missing is a pointer. Add one sentence to each file naming the other as an intentional twin, and — this is the part that does the work — say where they already differ on purpose, so the next editor meets the divergence as a decision rather than discovering it as a bug.

## Design decisions

1. **Two pointers, not one.** An editor arrives at whichever file their task concerns; a pointer in only one of them helps only half the time.

2. **The pointers name the known divergences explicitly.** "These files share a format, keep them in sync" would be actively misleading, since they are already and deliberately not identical. Naming the two differences — `Existing Issue` versus `Existing Debt`, and a severity scale reworded for pull-request review against an identical risk scale — is what turns the pointer from a vague obligation into a usable description of the relationship.

3. **No third shared file.** Extracting the format into a document both include would remove the duplication properly, and it is not available: task files in `ai/tasks/` are self-contained prompts with no include mechanism, and splitting one would break the property that an agent can execute a task from a single file. The duplication is accepted; only its invisibility is fixed.

4. **No enforcement.** Nothing checks that an edit to one file reaches the other. A test comparing the two would have to encode which differences are intentional, and that list is itself the thing most likely to go stale. The pointer is the whole fix, and a deliberate divergence still lands silently — which is acceptable, because a deliberate divergence is allowed.

5. **The pointer goes where the format is defined, not in either preamble.** An editor changing a scale is reading the scales section, not the preamble. Placing it beside the definition puts it in the path of the edit it is meant to catch.

## Implementation steps

Two files change, one sentence each.

1. **`ai/tasks/pull-request-review.md`**, in the "The entry format" section: name `ai/tasks/research/find-technical-debt.md` as the file this format is shared with, state that the two are intentional copies, that a change to the format or to either scale belongs in both, and that they differ on purpose in exactly two places — the first labeled paragraph is `Existing Issue` here and `Existing Debt` there, and the severity scale is reworded for pull-request review while the risk scale is identical.

2. **`ai/tasks/research/find-technical-debt.md`**, in Step 4 where its five-part format is defined: the mirror sentence, naming `ai/tasks/pull-request-review.md` and the same two divergences from that side.

Nothing else in either file changes. Neither format, neither scale, and no step is edited.

## Tests

None. Two markdown files under `ai/tasks/` change, so there is no test surface — `./scripts/run.mjs check-diff` sees only markdown outside `src/` and `web/`, assembles an empty tool list, and exits 0.

## Out of scope

- Extracting the shared format into a third file (decision 3).
- Any automated check that the two stay in step (decision 4).
- Reconciling the severity scales. They differ deliberately, and this change records that rather than undoing it.
- `product/backlog/technical-debt.md` and `product/backlog/pull-request.md` themselves, whose existing entries are untouched.
- The other `find-*.md` research tasks, which write single-paragraph bullets rather than the five-part structure and so are not twins of either file.

## Verification

`./scripts/run.mjs check-diff` — expected to run no tools and exit 0.

Manual: open `ai/tasks/pull-request-review.md` at "The entry format" and confirm the pointer names the other file and both intentional divergences. Open `ai/tasks/research/find-technical-debt.md` at Step 4 and confirm the mirror sentence says the same from that side.

Manual: confirm neither file's format, scales, or steps changed otherwise — `git diff` on this commit should show one added sentence in each file and nothing else.
