# Test task installs only the lockfile it audited

**Complexity: 1/10** — one command and its surrounding sentences in one playbook, one spec sentence, and two pin assertions.

## Goal

`ai/tasks/test-pull-request.md` Step 3 audits the branch's `package-lock.json`, then runs `npm install --ignore-scripts`. `npm install` re-resolves any dependency the branch's `package.json` declares that the lockfile does not match. So a branch whose manifest and lockfile disagree gets packages installed that the audit never read, and the build in Step 7 then runs them. `scripts/check-malicious-package.mjs` reads only the lockfile, which is why the lockfile has to be exactly what gets installed.

## Approach

Replace `npm install --ignore-scripts` with `npm ci --ignore-scripts`. It installs exactly the lockfile and exits non-zero when `package.json` and `package-lock.json` disagree, instead of resolving new versions. The rebuild and `chmod` lines from the preparation task's Step 3 still follow it. A failed `npm ci` stops the run before anything is built and is reported as the lockfile being out of sync with the manifest. That's not a finding, consistent with the task's rule that a branch which will not build or start is reported rather than recorded, and the run never falls back to `npm install`. `npm ci` does not rewrite the lockfile, so the sentence about reverting a rewritten `package-lock.json` goes away. The check that `git status` is clean afterwards stays.

## Implementation steps

1. `ai/tasks/test-pull-request.md` Step 3: count this as a third change to the preparation task's Steps 2 and 3, swap the install command, state the stop-on-failure rule, and drop the lockfile-revert sentence.
2. `product/specs/pull-request-testing.md`: say the install matches the audited lockfile exactly and a branch whose manifest and lockfile disagree is reported as untestable.
3. `scripts/test-pull-request-playbook.test.mjs`: pin that the playbook installs with `npm ci --ignore-scripts` and never with `npm install --ignore-scripts`.

## Tests

Two assertions in `scripts/test-pull-request-playbook.test.mjs`: the playbook contains `npm ci --ignore-scripts`, and it never instructs the reader to run `npm install`. The playbook still names `npm install --ignore-scripts` once, to say what `npm ci` replaces, so the negative assertion matches the instruction's phrasing rather than the bare command.

## Out of scope

- `scripts/check-malicious-package.mjs` and `ai/tasks/workspace/prepare-workspace.md`, which install a trusted branch.
- Session-ending steps (a separate backlog entry).
