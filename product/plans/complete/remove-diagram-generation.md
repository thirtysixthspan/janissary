# Remove the architecture and deployment diagram tasks

**Complexity: 2/10** — the feature is one self-contained cluster of agent tooling: two task playbooks, one vendored skill directory, two generated HTML artifacts, and one draft plan. Nothing in `src/`, `web/src/`, `product/specs/`, documentation navigation, or the backlog references any of it, so the removal deletes files only — no application code changes and no test edits.

## Goal

Remove the architecture-diagram and deployment-diagram research tasks and everything that supports them: the vendored `diagram-design` skill, the two generated diagrams, and the draft plan that proposed the architecture task. After this removal `ai/tasks/research/` no longer offers `generate-architecture-diagram` or `generate-deployment-diagram`, no diagram renderer ships under `skills/`, and `documentation/diagrams/` no longer exists.

## Approach

Inventory established that the feature has no touch points:

- The task picker enumerates `ai/tasks/` by walking the directory (`src/tasks.ts`), so deleting the two task files removes them from the picker with no list to update.
- `skills/` also holds `agent-merge-changes`, `ask-user`, and `perplexity-search`; only `skills/diagram-design/` is removed and the `skills/` directory itself stays.
- No spec, documentation page, sidebar entry, README line, backlog entry, or source file references `generate-architecture-diagram`, `generate-deployment-diagram`, `diagram-design`, or `documentation/diagrams`. The remaining "diagram" mentions (ASCII diagrams in PR-body guidance, `diagram.png` example filenames, alt-text guidance) are unrelated and are left byte for byte.
- No application code reads the skill's runtime data (`~/.diagram-design/` profiles, `.diagram-design` project markers), so old data left on users' machines is tolerated, never migrated or cleaned up.

Settled scope decisions (Step 5 of `ai/tasks/feature/remove-an-existing-feature.md`), answered by the user:

1. Remove the vendored `skills/diagram-design/` skill entirely — it has no consumers in this repo other than the two tasks.
2. Delete `documentation/diagrams/architecture.html` and `deployment.html` along with the now-empty directory — they are artifacts of the removed tasks and nothing links to them.
3. Delete `product/plans/draft/generate-architecture-diagram.md` rather than preserving it as a record.

## Implementation steps

1. `ai/tasks/research/generate-architecture-diagram.md` — delete.
2. `ai/tasks/research/generate-deployment-diagram.md` — delete.
3. `skills/diagram-design/` — delete the whole directory (228 files: `SKILL.md`, `references/`, `assets/`, `scripts/`, `LICENSE`, `THIRD_PARTY_LICENSES.md`).
4. `documentation/diagrams/architecture.html` and `documentation/diagrams/deployment.html` — delete both files, then the empty `documentation/diagrams/` directory.
5. `product/plans/draft/generate-architecture-diagram.md` — delete.

Run `./scripts/run.mjs check-diff` after each step and fix what it reports before continuing.

## Tests

None. No test under `src/**/*.test.ts` or `web/src/**/*.test.ts(x)` references the tasks, the skill, or the diagrams (searched). The full suite must stay as green as the Step 2 baseline.

## Spec updates

None. No spec in `product/specs/` describes the tasks, the skill, or the diagrams (searched).

## Verification

- Fast check after each step: `./scripts/run.mjs check-diff`.
- Full checks at the end: `npm run typecheck`, `npm run lint` (baseline carries one pre-existing warning, `sonarjs/cognitive-complexity` in `web/src/shared/fuzzy-match.ts:109`), and `npm test` (baseline: 841 test files, 11896 passed, 1 skipped). `npm run docs:build` runs as well because files under `documentation/` were deleted; it must pass.
- Live check: none — no remaining feature was detached.
- Dead-code scan baseline from Step 2 (`npm run knip`), which this removal leaves alone; each finding is named in the report:
  - `RemoteChip` — unused export, `web/src/plugins/api.ts:66`
  - `TabPluginLaunchReady` — unused exported type, `src/plugins/api.ts:24`

  Step 8 re-runs the scan, removes only findings not in this baseline, and leaves these two for `ai/tasks/hygiene/remove-deadcode.md`.

## Out of scope

- Historical records: `CHANGELOG.md` entries and the mention in `product/plans/complete/find-bugs-task.md` record what happened and stay untouched.
- The two pre-existing dead-code findings listed above — left for the hygiene task.
- Runtime data under `~/.diagram-design/` and any `.diagram-design` project marker — tolerated on disk, never migrated or cleaned.
- The three unrelated skills in `skills/` (`agent-merge-changes`, `ask-user`, `perplexity-search`).
