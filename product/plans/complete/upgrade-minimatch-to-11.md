# Upgrade minimatch to 11.0.8 to close GHSA-g3hv-75wg-m249

**Complexity: 4/10** — ~19 added lines, 3 files edited, 7 requirements, 9 test scenarios (p=5.14)

The only issue in `./product/backlog/issues.md` reports that the installed `minimatch` is affected by GHSA-g3hv-75wg-m249, a moderate denial-of-service advisory: versions `>= 7.0.0, < 11.0.1` allow attacker-controlled glob parts to be amplified during `optimizationLevel >= 2` preprocessing and then processed quadratically. `10.2.6`, the newest 10.x release, is still affected, so the only patch line is 11.0.1 or newer. The project installs a single hoisted `minimatch@10.2.5`, used both by the `file glob` matcher as a runtime dependency and by ESLint and its plugins as a development dependency. Every copy has to move to 11.x: bumping only the direct dependency would leave the transitive copies behind and keep `npm audit` failing. One plugin also blocks a blanket override: `eslint-plugin-import-x@4.17.1` imports minimatch's `makeRe`, an export v11 removed, so that plugin has to move to 4.18.1, the release that declares minimatch 11 support.

## Goal

Every installed copy of `minimatch` — the runtime dependency and the copies pulled in by ESLint, `@typescript-eslint`, and `eslint-plugin-import-x` — resolves to 11.0.1 or newer, preferably 11.0.8. `npm audit` reports no minimatch advisory. The `file glob` command keeps the exact matching behavior its spec describes: same wildcards, brace alternation, case sensitivity, dot-name handling, literal extglobs, and the same complexity and `..` refusals.

## Design decisions

- **Target 11.0.8, the current patch release.** The advisory's patched version is 11.0.1, and the newest available is 11.0.8. The security gate accepts `minimatch@11.0.8`, and there is no fixed 10.x release to consider.
- **Bump the direct dependency to `^11.0.8`.** `src/file-glob/match.ts` and `src/file-glob/pattern-limits.ts` import `Minimatch`, `braceExpand`, and the option object. Version 11 changed the matching engine — it walks a nonrecursive matcher instead of compiling each name to a regular expression — but kept those exports and options, and `braceExpand` still accepts `braceExpandMax`. No call site changes.
- **Add a root `overrides` entry of `^11.0.8`.** Five development dependencies declare only 9.x or 10.x ranges for minimatch, so npm would keep a nested vulnerable copy without an override. `npm audit fix --force` would reach the same 11.0.8 tree; declaring the override makes that outcome deterministic for every future install and for `npm ci`.
- **Move `eslint-plugin-import-x` to `^4.18.1`.** 4.17.1's `no-internal-modules` rule imports `makeRe` from minimatch, which v11 removed, so a blanket override makes ESLint fail to load its config. 4.18.1 declares `minimatch` `^9.0.3 || ^10.1.2 || ^11.0.1` and is the first release that works with the patched line. It stays within the plugin's existing major version.
- **Keep the existing matcher options and caps unchanged.** `noext` keeps extglob groups such as `+(a|b)` literal, matching the spec; `optimizationLevel: 2` and the POSIX platform keep the path rules the same. The caps and the `..` refusal still run before minimatch sees a pattern, so the command's documented refusals and their messages do not change. The `..` refusal also keeps v11's own `RangeError` path for excessive `**/..` splitting out of normal use, and `createGlobMatcher` still treats any construction failure as a match-nothing predicate.
- **Correct the two module comments that describe v10 internals.** `src/file-glob/match.ts` says extglobs "compile to nested quantifiers that backtrack catastrophically", and `src/file-glob/pattern-limits.ts` describes each `*` nesting another loop "in the compiled matcher". Those mechanisms belong to v10's regular-expression compiler. The comments are rewritten to state why the options and caps still apply under v11's matcher, without changing any code path.

## What already exists (reuse, don't rebuild)

| Piece | Where | How the upgrade uses it |
| --- | --- | --- |
| Runtime matcher and its option set | `src/file-glob/match.ts` (`createGlobMatcher`) | Unchanged; its two comments are corrected for v11's engine. |
| Pattern caps and `..` refusal | `src/file-glob/pattern-limits.ts` (`globPatternRefusal`, `isGlobPatternTooComplex`) | Unchanged; its module comment is corrected. |
| Advisory-shaped regression coverage | `src/file-glob/match.test.ts` and `src/file-glob/pattern-limits.test.ts` — the repeated `**/..` pattern is already refused quickly | Proves the documented refusal survives the engine change. |
| Package update gate | `./scripts/run.mjs check-malicious-package minimatch@11.0.8` | Run before any install that writes `node_modules/`. |
| Existing override precedents | `package.json` `overrides` (`keyv`, `flat-cache`, `file-entry-cache`, `@keyv/*`, `@vitejs/plugin-vue`) | Same mechanism is used to pull every transitive minimatch forward. |
| ESLint plugin that still reads v10-only API | `node_modules/eslint-plugin-import-x/lib/rules/no-internal-modules.js` (`makeRe`) | The plugin moves to 4.18.1, which supports minimatch 11. |
| Manifest-shaped tests | `src/chrome-extension.test.ts` reads the root `package.json` for a `files` entry | Precedent for a small test that reads a root manifest. |

## Implementation steps

1. **`package.json`.** Change `dependencies.minimatch` from `^10.2.5` to `^11.0.8`, change `devDependencies.eslint-plugin-import-x` from `^4.17.0` to `^4.18.1`, and add `"minimatch": "^11.0.8"` to `overrides`.
2. **Re-resolve and verify the tree.** Run `./scripts/run.mjs check-malicious-package minimatch@11.0.8 eslint-plugin-import-x@4.18.1`, then `npm install --ignore-scripts`, then `npm rebuild esbuild node-pty unrs-resolver` and the `spawn-helper` chmod from the workspace playbook. Confirm `npm ls minimatch` shows one deduped `11.0.8`, `eslint-plugin-import-x` is 4.18.1, and `npm audit` no longer lists the minimatch advisory or any dependent advisory.
3. **`src/file-glob/match.ts`.** Rewrite the comment above `createGlobMatcher` so it explains the current reasons for the option set: case-sensitive matching on every host, literal extglob groups through `noext`, the normalized pattern handed to minimatch, and the match-nothing fallback for a rejected pattern. No code changes.
4. **`src/file-glob/pattern-limits.ts`.** Rewrite the module comment above `globPatternRefusal` so the caps are described in terms of the matching work minimatch performs rather than v10's regex compilation, and so the `..` refusal names v11's `optimizationLevel 2` `**/..` splitting and its `RangeError` limit. No constant, message, or code changes.
5. **New test `src/file-glob/minimatch-version.test.ts`.** Read the root `package-lock.json`, collect every `packages` entry whose key is or ends in `/node_modules/minimatch`, and assert each resolved version is at least `11.0.1`. This makes a future re-resolution that reintroduces a nested 10.x copy fail in the normal test run.
6. **Two web test imports.** `web/src/plugins/shell/markdown-block.test.ts` and `web/src/shared/transcript/markdown.test.ts` import `@shared/*` with a trailing `.js`, which the 4.18.1 `import-x/extensions` rule correctly rejects for a bundler-resolved TypeScript path. Drop the `.js` suffixes; every other `@shared/*` import in `web/src` is already extensionless and resolves the same way.

## Tests

- `src/file-glob/minimatch-version.test.ts` — new: every lockfile minimatch entry is at least 11.0.1; a lockfile with no minimatch entry fails rather than passing vacuously.
- `src/file-glob/match.test.ts` — existing: the `**/..` amplification pattern, backslash normalization, literal extglobs, bracket classes, dot-name behavior, and oversized-pattern fallback must all still pass under v11.
- `src/file-glob/pattern-limits.test.ts` — existing: every cap, the `..` refusal, and the backslash-brace counting must still pass under v11.
- The rest of the server and client suites — existing: ESLint, `@typescript-eslint`, `eslint-plugin-import-x`, and `eslint-plugin-sonarjs` now resolve minimatch 11 through the override, so linting the whole tree exercises the new engine on their call sites.
- Full `npm run lint` — existing: proves ESLint's config loads and every rule that uses minimatch works with `eslint-plugin-import-x` 4.18.1.

## Spec and documentation

- No functional spec change. The fix removes a vulnerable dependency without changing any user-visible behavior; `product/specs/acp.md` describes `file glob` matching, refusals, and messages exactly as they remain.
- No `help/` or `documentation/user-documentation/` change. Neither documents dependency versions or the matcher's internals.

## Out of scope

- **Removing the pattern caps.** v11's nonrecursive matcher makes the old regular-expression caps less necessary, but removing them would change documented behavior and needs its own decision.
- **Other outdated packages.** The backlog names only minimatch.
- **Changing `noext`, `optimizationLevel`, platform, or case-sensitivity options.** They are part of the documented `file glob` behavior.
