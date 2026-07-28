# Accept an unlisted work item in the work-an-issue task

**Complexity: 2/10** — a prompt-document change confined to `ai/tasks/work-an-issue.md`: four passages decide what happens when the invocation names something the issues file does not contain.

## Goal

Let `execute ai/tasks/work-an-issue.md "<work item>"` proceed on the named work item even when no entry in `./product/backlog/issues.md` matches it — including when the file holds no issues at all. Today both cases stop the run with "no matching issue was found", which forces a user who has a one-off item in hand to file it in the backlog first only to have the same run delete it again.

Unlisted work items are worked exactly like listed ones — same complexity gate, same plan, tests, spec, documentation, and merge — with one difference: there is no backlog line to remove afterwards, and the named item is never written into the issues file.

## Approach

- Keep the file-driven path unchanged: with no argument, the task still reads the issues file, stops when it is empty, and picks the first entry.
- Make the "no entry matches" branch fall through to the named text itself rather than stopping, and make the empty-file stop condition apply only when nothing was named.
- Make the removal step and the report tolerate an item that was never in the file, so the rest of the workflow needs no special-casing.

Only `ai/tasks/work-an-issue.md` changes. The issue's subject is that playbook, so it stands in for "source" here; the specs, `help.md`, and public documentation describe the task picker that lists task files, not the instructions inside any one of them, and none of them documents this task's argument handling.

## Implementation steps

1. Update the "Your job" summary so the work item may come from the issues file **or** from the invocation, and so removing the backlog line is conditional on it having come from the file.
2. Rewrite Step 1: the empty-file stop applies only when no work item was named; the named-item branch takes the argument at face value when nothing matches; the pick statement says which source the item came from.
3. Update Step 7 so the removal step is a no-op for an item that was never in the issues file, and extend the Forbidden rule about the issues file so it also forbids adding the named item to it.
4. Update the Step 9 report shape so the `Issue:` line reads either the entry from the issues file or the work item as named in the invocation.

## Tests

None. The change is entirely within an agent prompt document — it has no runtime surface, no importable behavior, and no test hooks; nothing under `src/` or `web/src/` reads the contents of a task file. `./scripts/run.mjs check-diff` still runs over the diff as a guard.

## Out of scope

- The same argument handling in `fix-a-bug.md`, `build-a-feature.md`, or the hygiene playbooks.
- Adding a named work item to `./product/backlog/issues.md` automatically.
- Relaxing the 7/10 complexity gate for unlisted work items.
- The `git mv` in Step 2, which fails on the still-untracked plan file (`fix-a-bug.md` uses plain `mv` for this) — a separate defect, unrelated to accepting an unlisted work item.
