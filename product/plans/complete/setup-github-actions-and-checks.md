# Setup GitHub Actions and checks

Add a GitHub Actions CI workflow that runs the project's typescript, lint, and test checks on every pull request targeting `master`, so problems are caught before a PR merges rather than relying on contributors to run the checks locally. The repo currently has no `.github/` directory or workflow at all — this is a from-scratch setup, not an extension of an existing CI config.

## Design decisions

1. **Trigger: pull requests only.** The workflow runs on `pull_request` events targeting `master`. It does not run on direct pushes to `master`.
2. **Job layout: three separate parallel jobs.** One job each for typecheck, lint, and tests, running in parallel rather than as a single combined job. Each shows as its own status check on the PR.
3. **Node version: 24 only.** CI runs against Node 24, matching the version pinned in `.nvmrc`. No multi-version matrix.
4. **Required status checks.** The three jobs are intended to block merging on failure. Configuring the actual GitHub branch-protection rule to require them is a repo-admin action taken outside this repo's files (in the GitHub UI/API), not something this plan's workflow YAML can enforce by itself — the plan produces the checks; enabling "required" is a follow-up manual step for whoever administers the repo.
5. **Job/check names: `typescript`, `lint`, `tests`.** These match the exact wording used in the feature's backlog entry, and are the names branch protection will later reference.
6. **Concurrency: cancel superseded runs.** The workflow uses a concurrency group keyed on the PR (e.g. `github.workflow`-`github.ref`) with `cancel-in-progress: true`, so pushing new commits to a PR cancels the older, now-stale run instead of letting both finish.
7. **Dependency caching: enabled via `actions/setup-node`.** Each job uses `actions/setup-node`'s built-in `cache: 'npm'` keyed on `package-lock.json`, rather than a bare `npm ci` with no cache.
8. **Full (non-diff) commands, not the AI diff-scoped ones.** CI checks the entire repo state on every run, so jobs invoke the full `npm run typecheck`, `npm run lint`, and `npm run test` scripts (see `package.json`) — not the `*:diff` variants documented in `CLAUDE.md` for local iterative development, which are scoped to the uncommitted working tree and don't apply to a clean PR checkout.

## What already exists (reuse, don't rebuild)

| Need | Existing precedent | Location |
| --- | --- | --- |
| Node version to target | `.nvmrc` (pins Node 24) | `.nvmrc` |
| Typecheck command | `npm run typecheck` (runs `tsc --noEmit` for both `tsconfig.json` and `web/tsconfig.json`) | `package.json` |
| Lint command | `npm run lint` (`eslint .`) | `package.json` |
| Test command | `npm run test` (`vitest run --project server --project client`) | `package.json` |
| Combined reference for what "full check" means | `npm run check` (`typecheck && lint && test`) | `package.json` |

No `.github/` directory, no `product/specs/` file on CI, and no comparable in-repo automation exist yet — this feature has no closer precedent than the npm scripts above.

## Proposed changes

- New file `.github/workflows/ci.yml`: a GitHub Actions workflow triggered on `pull_request` targeting `master`, defining three jobs — `typescript`, `lint`, and `tests` — each running on `ubuntu-latest`, checking out the repo, setting up Node 24 via `actions/setup-node` with npm caching enabled, installing dependencies with `npm ci`, and then invoking the matching full npm script (`npm run typecheck`, `npm run lint`, `npm run test` respectively). The workflow declares a top-level `concurrency` block keyed on the workflow name and PR ref with `cancel-in-progress: true`.
- No changes to `package.json` scripts are needed — the workflow calls the existing `typecheck`, `lint`, and `test` scripts as-is.
- No source, test, or app config changes — this plan is scoped entirely to the new workflow file.

## Tests

CI workflow YAML isn't covered by the project's vitest suites (server/client projects only cover `src/` and `web/src/`). Verification is instead: the workflow's own execution acts as its test — opening a PR against this branch should show three separate `typescript`, `lint`, `tests` checks running and reporting pass/fail. No new `.test.ts`/`.test.tsx` file is added for this change.

## Out of scope

- Configuring the actual GitHub branch-protection rule to mark the three checks as required (repo-admin action outside this repo's files — Decision 4).
- Running checks on direct pushes to `master` (Decision 1 — PRs only).
- A Node version matrix (Decision 3 — Node 24 only).
- `lint:css`, `quality`, `duplication`, `knip`, or any other check bundled only into `npm run check:full` — the feature's backlog text names only typescript, lint, and tests.
- Any deployment, release, or publish automation — this plan covers checks only.

## Open questions

None.

## Verification

- `./scripts/run.mjs check-diff`
- Manual: open a pull request against `master` from a branch containing this workflow file, and confirm the PR shows three separate status checks named `typescript`, `lint`, and `tests`, each completing with a pass/fail result; push an additional commit to the same PR and confirm the prior in-progress run is cancelled rather than left running alongside the new one.
