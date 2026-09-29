# Report the release commit's real subject in a dry run

**Complexity: 2/10** — one maintenance script builds a string in two places and prints the wrong one. The fix names that string once and uses it for both the dry-run report and the real commit. No application source changes, no wire protocol, nothing a user of the app can observe. The only real work is the regression test, because `scripts/release.mjs` runs at import time and has never had one.

## Root cause

`scripts/release.mjs` computes the tag once, as `const tag = \`v${newVersion}\``, but never computes the commit subject as a value. The real run writes it inline in the argument to `git commit`:

```js
run('git', ['commit', '-m', `feat(package): bump version to ${newVersion}`]);
```

The dry-run branch has no subject to print, so its report line interpolates the one value that is in scope, the tag:

```js
console.log(`\nWould commit: "${tag}"`);
console.log('Would tag:    ' + tag);
```

So every dry run prints the tag twice and never shows the subject the real run would commit.

## Correct behavior

`product/specs/release.md` says the commit's subject is `feat(package): bump version to <version>` and the tag is `v<version>`, and that a dry run "reports the commit subject and tag it would create". A dry run of `patch` from 0.15.0 therefore prints `Would commit: "feat(package): bump version to 0.15.1"` and, separately, `Would tag:    v0.15.1`. The subject it prints is the same string a `--for-real` run passes to `git commit`.

## Reproduction

`scripts/release.mjs` refuses to run off `master`/`main` and with a dirty tree. So the reproduction clones this checkout's committed HEAD (e6d2b163, `package.json` at 0.15.0) into `./temp/release-repro`, creates a local `master` branch there, and runs `node scripts/release.mjs patch` with `n` piped to the confirmation prompt. A throwaway script under `./temp/` does this. The output was:

```
Preparing release 0.15.0 -> 0.15.1 (DRY-RUN)
Version 0.15.0 -> 0.15.1 in package.json, package-lock.json (dry-run, not saved)
Would commit: "v0.15.1"
Would tag:    v0.15.1
```

The clone's status, HEAD and tags were unchanged afterwards, so the dry run's other guarantee holds. Only the `Would commit` line is wrong.

The new regression test (below) was written first. Against the unfixed script, both of its cases failed on the line `Would commit: "v0.12.1"` from its 0.12.0 fixture.

## Approach

Compute the subject once, next to the tag, as `const commitSubject = \`feat(package): bump version to ${newVersion}\``. The dry-run `Would commit` line prints `commitSubject`, and the real run's `git commit -m` takes `commitSubject`. There is then one definition of the subject, so the report can't drift from what gets committed. That is the risk the bug report names.

Rejected: moving the subject into `scripts/release/changelog.mjs` next to `isReleaseCommit`. It would make the subject importable, but the test that matters exercises the printed report. And a builder beside a recognizer is a second place to keep in sync, not fewer.

## Implementation steps

1. **`scripts/release.mjs`.** Add `const commitSubject = \`feat(package): bump version to ${newVersion}\`;` directly after `const tag = …`. Change the dry-run line to `console.log(\`\nWould commit: "${commitSubject}"\`);`. Change the real run's commit to `run('git', ['commit', '-m', commitSubject]);`.

## Regression test

`scripts/release.test.mjs`, new. It uses vitest with the plain `describe`/`it`/`expect` style of `scripts/release/version-files.test.mjs`. Each test builds a throwaway git repository in the OS temp directory: `scripts/release.mjs` and its two `scripts/release/` modules copied in, a `package.json` and `package-lock.json` at 0.12.0, and one commit on `master`. It strips inherited `GIT_*` variables so git can't be pointed at another repository. It then runs `scripts/release.mjs patch` there with `n` on stdin and reads the report.

- `reports the subject the release commit would carry`: the `Would commit:` line is exactly `Would commit: "feat(package): bump version to 0.12.1"`.
- `reports the tag on its own line, not in place of the commit subject`: the `Would tag:` line is `Would tag:    v0.12.1`, and the `Would commit:` line does not contain `"v0.12.1"`.

Both failed before the fix and pass after it.

## Verification

- `./scripts/run.mjs check-diff` passes, including the new test file.
- Re-run the throwaway reproduction against the fixed script (the clone gets the working-tree `scripts/release.mjs` committed on top, so its tree is clean). Expect `Would commit: "feat(package): bump version to 0.15.1"` and `Would tag:    v0.15.1`, with the clone's status, HEAD and tags unchanged.
- Live end-to-end check in the app: not possible. The bug is in a maintenance script with no path through the running application. The dry run on a real clone of this repository, above, is the end-to-end check for this tool.

## Spec and documentation

- `product/specs/release.md` already describes the correct behavior. The Dry runs section gains the two report lines verbatim, so the exact wording is pinned where a contributor will look for it.
- `documentation/developer-documentation/release-process.md` doesn't describe the dry-run report's wording. No change.
- `help.md` and `documentation/user-documentation/` don't cover the release script. No change.

## Out of scope

- The rest of the dry-run report: the changelog preview and the version-files line are correct.
- `scripts/publish.mjs`, which has its own dry run and doesn't print a commit subject.
- Extracting more of `release.mjs` into testable modules.
