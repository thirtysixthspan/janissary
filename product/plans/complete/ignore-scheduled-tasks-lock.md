# Keep the harness's scheduling lock file out of the repository

**Complexity: 1/10** — one `.gitignore` line and a test that pins it. No source change, no new architecture.

The Claude Code harness writes `.claude/scheduled_tasks.lock` into the checkout while a scheduled task is running. Nothing in this codebase creates it, reads it, or knows it exists — it is the harness's own coordination state, and it belongs to the machine rather than the project.

Left untracked it is not merely untidy. Every shipping path in `ai/tasks/` commits through `scripts/pr-commit.sh`, which stages with `git add -A`. A scheduled run that happens to overlap a task's commit step sweeps the lock file into the commit, and from there into `master`. `.claude/settings.local.json` is already ignored for exactly this reason; this is the same file class arriving from a newer harness feature.

## Approach

**One literal path, not a wildcard.** `.claude/` also holds `settings.json`, which is tracked, ships in the package (`package.json`'s `files` list), and carries the project's own permission allowlist. A `.claude/*.lock` or `.claude/` pattern would risk that file or its future siblings; naming the one path the harness writes says exactly what is meant and leaves everything else visible. It goes next to `.claude/settings.local.json`, which is the same decision already made once.

**Tested by asking git, not by reading the file.** The behavior that matters is "git ignores this path", not "this string appears in `.gitignore`" — a line in the wrong section, or shadowed by a later negation, would satisfy a text match and still let the file through. `git check-ignore` answers the real question. The test pins the boundary in both directions: the lock file is ignored, and `.claude/settings.json` is not, so a later broadening of the pattern to `.claude/` cannot pass unnoticed.

## Implementation steps

1. `.gitignore` — add `.claude/scheduled_tasks.lock` beside the existing `.claude/settings.local.json` entry.

## Tests

- `src/gitignore.test.ts` (new): `git check-ignore` reports `.claude/scheduled_tasks.lock` as ignored, and reports `.claude/settings.json` as not ignored. Placed beside `src/janissary-root.test.ts`, which already makes assertions about the shape of the checkout rather than about one module's return value.

## Out of scope

- **Ignoring the rest of `.claude/`.** `settings.json` is tracked and shipped; only the harness-written lock file is being hidden.
- **Anything that creates or manages the lock file.** It is the harness's, not this project's, and this change does not give the codebase an opinion about it.
- **The already-committed history.** The file is not in the tree today, so there is nothing to remove.

## Verification

Automated: `$janissary/scripts/run.mjs check-diff`.

Manual: `git status --short` stays clean while a scheduled task holds the lock.
