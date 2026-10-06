# Remove stylelint

**Complexity: 3/10** — this is a development-tool removal across package metadata, check scripts, active contributor guidance, and the docs site. CSS and application behavior stay unchanged; no product spec or runtime state is involved.

## Goal

Remove stylelint as a repository tool. Contributors' check workflows no longer run a CSS linter, and active docs and agent workflows no longer direct them to stylelint. CSS files remain in place and continue to use Prettier for formatting. Existing type, lint, test, complexity, duplication, and dead-code checks retain their current behavior.

## Approach

Remove the active stylelint installation and its direct integrations: package dependencies and overrides, npm scripts, the Stylelint config, Knip's dependency exception, and the CSS-lint step in the PR gate. Delete the dedicated CSS-linting contributor page and task, and remove their active navigation and workflow references.

Keep CSS declarations and rendered styles unchanged. Keep the sandbox rule and test that permit `package.json` and `tsconfig.json` reads under `$HOME`; ESLint, Prettier, PostCSS, and TypeScript-related resolvers still need that general carve-in. Remove only stylelint-specific wording from those comments and from the CSS source comment.

## Scope decisions

1. **Boundary** — remove the active stylelint feature end to end: dependencies, configuration, scripts, gate integrations, dedicated documentation and task, and active references. CSS files and all unrelated checks stay.
2. **Check workflows** — remove CSS lint from `lint:all`, `check:full`, and `scripts/pr-check-gate.sh`; each workflow keeps its other checks and has no replacement CSS linter.
3. **Agent workflow** — delete `ai/tasks/hygiene/improve-style.md` and remove its route and stylelint diagnostics from `ai/tasks/hygiene/improve-codebase.md`.
4. **Deferred plans** — leave the stylelint proposals in `product/plans/deferred/browser-perf.md` and `product/plans/deferred/tab-plugin-architecture.md` unchanged, as requested.
5. **Documentation wording** — delete the dedicated CSS-linting page and its links, and remove active claims that the checks run CSS lint. Do not add a replacement-tool recommendation or a removal notice.
6. **Shared pieces** — keep CSS and the generic sandbox package/config resolver carve-in. Only stylelint-specific mentions are removed from `src/sandbox/profile.ts`, `src/sandbox/live.sandbox.test.ts`, and `web/src/theme.css`.
7. **Specs and backlog** — no product spec or backlog entry concerns stylelint.
8. **Data and contracts** — stylelint has no application runtime behavior, persisted user data, or published extension contract. Its repository-local config is deleted; no migration or cleanup of user data is needed.
9. **Historical records** — leave completed plans and `CHANGELOG.md` untouched. The two deferred plans named in decision 4 also remain untouched.

## Implementation steps

1. **Package and tooling configuration** — remove `lint:css` and `lint:css:fix` from `package.json`; remove stylelint's nested dependency overrides and the three now-orphaned `hashery`, `hookified`, and `qified` overrides, plus its dev dependencies; remove `stylelint-config-standard` from `knip.json`; delete `web/.stylelintrc.json`; regenerate `package-lock.json` from the updated manifest.
2. **Check gates** — remove `lint:css` from `lint:all` and `check:full` in `package.json`, and from the hard-check list in `scripts/pr-check-gate.sh`.
3. **Active agent guidance** — remove the stylelint route and diagnostic command from `ai/tasks/hygiene/improve-codebase.md`; delete `ai/tasks/hygiene/improve-style.md`.
4. **Active documentation** — delete `documentation/developer-documentation/css-linting.md`; remove its index and VitePress sidebar entries; update `AGENTS.md` and `documentation/developer-documentation/checking-changes.md` so they do not claim the human check runs CSS lint.
5. **Incidental references** — remove stylelint-only wording from the sandbox resolver comments and their test, and remove the linter rationale from the short-color comment in `web/src/theme.css`. Do not change CSS declarations or sandbox behavior.
6. **Review references** — search active files for remaining stylelint names and CSS-lint commands. The retained mentions in the two deferred plans and historical completed plans are intentional per the scope decisions.

## Tests

No remaining feature test asserts stylelint behavior. `src/sandbox/live.sandbox.test.ts` has only a comment naming stylelint among resolver tools; its sandbox behavior and assertions stay unchanged. Run the full existing server and client test suite to ensure removal of the dependency and active integrations does not affect the application.

## Spec updates

None. Stylelint is a contributor tool and has no product behavior spec.

## Verification

Checks discovered from `AGENTS.md` and `package.json`:

- Fast check after each implementation step: `./scripts/run.mjs check-diff`.
- Full checks: `npm run typecheck`, `npm run lint`, and `npm test`; build the docs with `npm run docs:build` because a docs page and navigation entry are removed. Each must be as green as the baseline.
- Dead-code scan: `npm run knip`; compare against the complete baseline below and remove only findings newly introduced by this change.
- Check workflow coverage: exercise `lint:all`, `check:full`, and `scripts/pr-check-gate.sh` after removal and confirm none invokes stylelint.
- No live application check is planned: stylelint is a developer-only command with no application UI, persisted state, or runtime behavior. The remaining check workflows are exercised directly.

Baseline results before removal:

- Typecheck passed.
- Lint passed with 0 errors and 1 warning: `web/src/shared/fuzzy-match.ts:109:17`, cognitive complexity 16 (limit 15).
- Tests passed: 841 files, 12,163 tests passed, 1 skipped.
- Knip findings:

```
Unused files (1)
src/plugins/search/matcher-worker-entry.ts
Unlisted binaries (6)
gitleaks      package.json
opengrep      package.json
mkfifo        src/notifications/record.test.ts
sandbox-exec  src/sandbox/keychain.sandbox.test.ts
sandbox-exec  src/sandbox/opencode-models.sandbox.test.ts
getconf       src/sandbox/resolve.ts
Unresolved imports (4)
.../workspace/manager.js  src/git/sync.test.ts:2:39
./config.js               src/notifications/index.test.ts:2:41
./managers.js             src/notifications/index.test.ts:3:31
../protocol.js            src/plugins/shell/shared.test.ts:2:59
Unused exports (4)
SEARCH_INSTANCE_KEY            src/plugins/search/session.ts:165:26
isEdited             function  web/src/plugins/image/edit-model.ts:55:17
isNullCell           function  web/src/plugins/sql/grid-view.ts:171:17
currentObject        function  web/src/plugins/sql/grid-view.ts:193:17
Unused exported types (3)
ClearFiltersIntent  type  src/plugins/sql/shared-intents.ts:25:13
RefreshIntent       type  src/plugins/sql/shared-intents.ts:29:13
OverlayPluginItems  type  web/src/overlay-plugins/api.ts:65:13
Configuration hints (2)
web/src/env.d.ts    knip.json  Remove from ignore
open                knip.json  Remove from ignoreBinaries
```

Results after removal:

- `./scripts/run.mjs check-diff` passed after each implementation step.
- `npm run check:full` passed: typecheck clean; lint 0 errors and the same 1 warning; 841 test files passed, 12,163 tests passed, 1 skipped; quality, duplication, and Knip completed.
- `npm run lint:all` passed with the same lint warning.
- `npm run docs:build` passed.
- The post-removal Knip scan matched the baseline exactly; no new finding was created.
- Diff review found and removed the now-unused `hashery`, `hookified`, and `qified` package overrides; none has a remaining lockfile consumer.
- `./scripts/run.mjs pr-check-gate` passed. No application live check applies: stylelint was a developer-only command with no app UI, persisted state, or runtime behavior, and the remaining check workflows were exercised directly.

## Out of scope

- Replacing stylelint with another CSS linter or changing how CSS is authored.
- Changing CSS declarations, app rendering, sandbox permissions, or resolver behavior.
- Editing the deferred plans retained in decision 4, completed plans, or `CHANGELOG.md`.
