# Build the cloned runscript name from the shared path rule
**Complexity: 1/10** — one argument in one function, derived from the same helper that the create path and the reads already use.

## Goal

`cloneRunscript` in `src/schedule/system/runscript-files.ts` builds its candidate file name as a `${name}.rs` template literal before it calls `nextFreeName`. The create-path repair (`runscript-create-single-path`) routed `createRunscript` through `runscriptFilePath` but left this spelling in clone, so the `.rs` rule for a cloned runscript is still written in two places. Derive the candidate from `runscriptFilePath`, so the clone's file name and the path the reader resolves come from one definition. No behavior changes.

## Premise check

The brief for this fix says the design calls `nextFreeName` with a full file path. The complete plan `01-runscript-file-operations` says the opposite. It calls `nextFreeName(dir, name)` with the runscripts directory and a bare file name that includes its extension, and it returns that name with its extension. The source agrees: `src/editor/next-free-name.ts` joins `dir` with `name` for its existence check and returns the bare candidate.

A full path would break this contract. `path.join(dir, '/root/.janissary/scripts/deploy.rs')` concatenates the two, so the existence check looks in a doubled directory, the returned candidate is an absolute path, and `path.join(directory, target)` builds a doubled write path. The candidate therefore has to be a bare name.

`path.basename` of the helper's result is exactly `${name}.rs`, the same string the template literal builds today. `nextFreeName` splits it on `path.extname`, which is `.rs`, so the counting is unchanged: `deploy-2.rs`, then `deploy-3.rs`.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this plan uses it |
| --- | --- | --- |
| Runscript path helper | `src/schedule/system/runscript-files.ts` (`runscriptFilePath`, exported) | Its result's basename becomes the `nextFreeName` candidate. |
| Free-name selection | `src/editor/next-free-name.ts` (`nextFreeName`) | Called unchanged, with the runscripts directory and the bare candidate. |
| Name validation | `readRunscript`, called at the top of `cloneRunscript` | Guarantees the name has no separator, so the basename is the name plus `.rs`. |

## Design decisions

- The candidate is `path.basename(runscriptFilePath(projectRoot, name))`. Only the candidate argument changes.
- `directory`, the `path.join(directory, target)` that builds the file path, the `createExclusive` refusal, and the `target.slice(0, -3)` return stay as they are.
- Rejected: passing `runscriptFilePath(...)` straight to `nextFreeName`, because of the doubled-path failure above.
- Rejected: a new `runscriptFileName(name)` helper that both `runscriptFilePath` and `cloneRunscript` call. It gives the same single definition, but it adds an export and changes two call sites for no added guarantee, since the basename already derives from the helper.
- `newUntitledRunscript` is left alone. Its `untitled.rs` seed is passed to `nextFreeName` and reaches the path through `createRunscript`, which calls `runscriptFilePath`, so it does not build a second path.

## Residual spellings (not changed here)

After this change the clone path is built in one place. The `.rs` suffix is still spelled in these name derivations, which do not build a path: the `endsWith('.rs')` filter and `slice(0, -3)` in `listRunscriptNames`, the `slice(0, -3)` returns in `cloneRunscript` and `newUntitledRunscript`, and the `'untitled.rs'` seed. If the suffix ever changes, those spots need edits too, and the clone's returned name would be wrong until they are fixed. That is beyond the one call site this entry names, and the entry rates the risk low. It is recorded here so the claim of a single definition is not overstated.

## Implementation steps

1. In `cloneRunscript`, replace `const target = nextFreeName(directory, `${name}.rs`);` with `const target = nextFreeName(directory, path.basename(runscriptFilePath(projectRoot, name)));`. No other line in the file changes, and no exported signature changes.
2. Correct the two sentences in `product/plans/complete/runscript-create-single-path.md` that exclude `cloneRunscript` and claim the only other `.rs` path construction sits inside `runscriptFilePath`: the paragraph under Design decisions and the matching Out of scope bullet. Nothing else in that plan changes.

## Tests

No test is added or edited. The change does not alter behavior, and the existing `cloneRunscript` cases already exercise the changed line: the `deploy-2` and `deploy-3` names and bytes, the race case where `nextFreeName` returns a bare `deploy-2.rs`, the missing-source case, and the symlinked-source refusal. A full-path candidate would fail the `deploy-2` case through the exclusive create, so those cases guard against the wrong shape. A test that pins the source text would be the only way to assert the derivation directly, and the create-path plan rejected that kind of test. All existing tests must pass without edits.

## Verification

Run `./scripts/run.mjs check-diff` after the change. Read the diff to confirm the only code line changed is the candidate, and that `cloneRunscript` no longer spells the `.rs` suffix in a template literal.

## Spec and documentation

No user-visible behavior changes, so no file under `product/specs/` changes. `help.md` and `documentation/user-documentation/` describe nothing that changes, so neither is updated.

## Out of scope

- The residual `.rs` spellings listed above, in `listRunscriptNames`, the two `slice(0, -3)` returns, and the `'untitled.rs'` seed.
- `newUntitledRunscript`, which already reaches the path through `createRunscript`.
- The `runscriptFileName` helper alternative.
- The exclusion-pin test in `src/schedule/system/runscript-refresh.test.ts`, whose root comes from the unresolved temp directory. That question is reported separately and is not changed by this fix.
- Any test file, export, or other source file.
