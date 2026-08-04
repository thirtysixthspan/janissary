# Update a Package Outside Its Declared Range (one package per run)

Your job: take **one** named package, move it to a target version its current `package.json` range does **not** allow, widen the range to match, change whatever code the new major requires, prove that the application still behaves exactly as `product/specs/` says it does — with no new security exposure — and **open a pull request for a human to review and merge**. Do exactly one package, then verify. Follow the steps **in order, exactly as written** — do not skip a step or combine steps.

**This task never merges its own work.** A breaking upgrade pulls new third-party code into the product, and whether that code is worth adopting is a human's call, informed by what you found. You open the PR (Step 11); someone else merges it.

This is the companion to [`find-packages-to-update.md`](../research/find-packages-to-update.md), which does the research and files the entry, and the deliberate exception to the rule the other dependency tasks live by. [`update-packages-with-patches.md`](update-packages-with-patches.md) may change no code and no range. [`update-package.md`](update-package.md) may change code but never the range. This task may change both — which is why it is the only one of the three that is never run speculatively, and the only one that carries the verification burden below.

**Widening the range is the point, and it is bounded.** You widen the range for **one** package, to **one** target version, exactly as far as reaching that version requires — normally by moving the caret range up a major (`^5.5.0` → `^6.0.0`). You never widen any other dependency's range except where a peer requirement forces it as part of the same coordinated set (Step 2), you never replace a range with `*` or `latest`, and you never loosen a range that was deliberately pinned without saying so in the report.

**The burden of proof is on the upgrade.** A green build is necessary and nowhere near sufficient. A major version's most dangerous changes are the ones nothing fails on: a changed default, a changed escaping or sanitization rule, a changed sort order, a changed error type that a `catch` no longer matches. The compiler cannot see them, and the tests only see them if a test already pinned that behavior. Steps 6 and 7 exist because of this, and skipping them because everything is green is the single most likely way this task ships a regression.

**No AI attribution — anywhere.** Never credit an AI agent as an author or contributor in anything this task produces. That means: no `Co-Authored-By:` trailers naming Claude or any other AI, no "Generated with Claude Code" (or similar) lines or badges, and no AI authorship notes in code, comments, docs, spec files, plan files, commit messages, or PR titles and bodies. This overrides any default convention that appends such attribution. The commit's configured git author is the only authorship ever recorded.

**Run autonomously.** This task runs unattended — do not ask the user questions or wait for feedback at any step. Only stop early for the conditions explicitly listed below.

The baseline rule still holds: **the compiler, the linter, and the tests must be green before you start and green again after you finish.** If not green before you start, stop and tell the user. If you cannot get it green again within the attempts Step 5 allows, revert everything and stop.

---

## The work item: named or handed over — never your own pick

This task upgrades one package past its declared range. That target comes from one of exactly two places:

1. **Named by the user at invocation** — e.g. `execute ai/tasks/hygiene/update-package-outside-range.md "<package>@<version>"`. Resolve it to exactly one dependency in `package.json`. If a version is not given, the target is the current `Latest` from `npm outdated`.
2. **Handed over with a backlog item** — [`resolve-technical-debt.md`](../resolve-technical-debt.md) runs this task against the package and version a `./product/backlog/technical-debt.md` entry names (its Step 2A). Treat it exactly like a user-named one, and **read the whole entry first**: a [`find-packages-to-update.md`](../research/find-packages-to-update.md) entry already contains the blast radius, the breaking-change mapping, the coordinated set, and the specs at risk. That research is an input to Step 2, not a substitute for it — verify it against the current release rather than trusting it wholesale, because the entry may be months old.

**There is no third case.** Unlike its in-range siblings, this task never selects a package for itself. If it is invoked with no target, report that it requires one, point at [`find-packages-to-update.md`](../research/find-packages-to-update.md) for producing candidates, and stop. Deciding that a breaking upgrade is worth its risk is a judgment call that belongs in a reviewed backlog entry, not in a playbook's selection step.

If the named package is not a dependency of this project, report that and stop. If its current version already satisfies the target, report that and stop — there is nothing to do here, and an in-range move belongs to [`update-package.md`](update-package.md).

---

## Step 0 — Prepare the workspace

Execute `ai/tasks/workspace/prepare-workspace.md` in full before doing anything else.

*(When [`resolve-technical-debt.md`](../resolve-technical-debt.md) triggers this task, it has already done this — skip it.)*

---

## Step 1 — Confirm the project is green and record the baseline

```bash
npx tsc --noEmit 2>&1
npm run lint 2>&1
npm test 2>&1
```

All three must pass: compiler has no errors, lint has no errors (warnings are fine), every test passes.

**If any of the three is not green, STOP and tell the user.** Do not proceed.

Then record the baseline you will compare against later. Run each once and keep the output in mind — you need the *before* picture, and re-deriving it after the upgrade is impossible:

```bash
npm audit 2>&1
npm ls <package> 2>&1
```

Note the total test count from `npm test`, the advisory counts from `npm audit`, and who depends on the package. Also note the exact declared range for the package in `package.json`.

---

## Step 2 — Research the migration before touching anything

Do not install first and read the errors afterwards. The errors only show you what breaks loudly; this step is how you learn what breaks quietly.

1. **Read the release history between the installed version and the target.** Use `node_modules/<package>/CHANGELOG.md`, the repository's releases and migration guide via `WebFetch`, and `WebSearch` for the specific migration when the changelog is thin. Cross every major and minor boundary in between — skipping from v5 to v8 means three sets of breaking changes, not one.
2. **List every breaking change**, and split the list in two:
   - **Loud** — removed exports, renamed APIs, changed signatures, changed module format. The compiler will find these.
   - **Silent** — changed defaults, changed output formatting, changed escaping or sanitization, changed sort or iteration order, changed error types or messages, changed timing or async ordering, newly-strict validation that now rejects input it used to accept. Nothing will find these except Step 6.

   Write the silent list down explicitly. It is the checklist you work through in Step 6, and it is the part of this task most likely to be skipped by accident.
3. **Find every call site.** `grep` the package name across `src/`, `web/src/`, `scripts/`, and config files (`eslint.config.mjs`, vite and vitest configs count). Map each breaking change onto the files it hits, or record that it does not apply.
4. **Determine the coordinated set.** Check peer dependencies (`npm view <package> peerDependencies`), companion `@types/*` packages, and any plugin ecosystem versioned in lockstep. If the target version cannot work without moving siblings, those siblings are part of this one work item and move together in Step 3. If the set is larger than about three packages, or the peer graph cannot be satisfied at all, stop and report it as too large for one run rather than half-upgrading the project.
5. **Vet the target release itself.** Check `npm view <package> time --json` for the publish date and whether the major has had time to collect its own patch releases; check `npm view <package> deprecated` and `engines`. A major published days ago, or one whose `engines` no longer matches this project's Node version, is a stop — report it and do not proceed.

If research shows the upgrade requires changes this task is not allowed to make — a public API of this project changing shape, a spec's documented behavior genuinely no longer being achievable — stop and report that. That is a planned feature change, not hygiene work.

---

## Step 3 — Establish the behavior contract

Before the version changes, write down what must still be true afterwards. This is what "retain the existing product specification behavior" means in practice, and it has to be concrete.

1. **Read the relevant specs.** Find the `product/specs/` file(s) describing behavior this package produces or shapes — rendering, parsing, sanitization, terminal emulation, scheduling, storage, network. Read them and list the specific, checkable statements they make about behavior the package is responsible for.
2. **Find the tests that already pin that behavior.** For each spec statement, note the test(s) that cover it, or note that none do. A spec statement with no test behind it is exactly where a silent change lands unnoticed — those are the ones you verify by hand in Step 6, and the ones you add tests for in Step 7.
3. **Note the user-visible surfaces involved** — which tab, which command, which output — so Step 6 knows where to look.

Keep this contract list. Steps 6, 7, and 8 all work from it.

---

## Step 4 — Widen the range and install

Back up the manifest and lock file (this step rewrites both):

```bash
cp package.json package.json.bak
cp package-lock.json package-lock.json.bak
```

Install the target version, which updates the declared range as a side effect:

```bash
npm install <package>@<target-version>
```

Install the whole coordinated set from Step 2 in the **same** command when there is one — a half-installed peer set produces failures that belong to the gap, not to the upgrade, and they will waste both of Step 5's attempts.

Then confirm what actually happened:

```bash
npm ls <package> 2>&1
```

Read the resulting `package.json` diff and check the range moved exactly as far as the target requires and no further. If `npm` widened or rewrote anything you did not intend, fix the range by hand in `package.json` and re-run `npm install` to reconcile the lock file.

---

## Step 5 — Re-check and fix, preserving behavior (max 3 attempts)

```bash
npx tsc --noEmit 2>&1
npm run lint 2>&1
npm test 2>&1
```

**All three green →** go to Step 6. Do not skip ahead to the pull request; green is the start of the verification, not the end.

**Not all green →** fix, within these bounds, for at most **3 attempts**:

1. Read the compiler output first — it names the file, line, and changed symbol, and it maps directly onto the loud list from Step 2. Consult `node_modules/<package>` for the new type definitions when the message alone is not enough.
2. **Adapt this project's code to the new API. Do not adapt the expected behavior to the new code.** The distinction governs every edit you make here:
   - Rewriting a call to the new signature so it does the same thing as before: correct.
   - Adding a shim so the rest of the codebase keeps its existing interface: correct.
   - Restoring a changed default explicitly at the call site so behavior is unchanged: correct, and usually the right response to a silent change.
   - Changing a test's expected value because the new version produces something different: **forbidden** unless the spec is what changed, which it is not in this task. A failing assertion is the upgrade telling you it changed behavior — that is a finding for Step 6, not a number to update.
   - Loosening an assertion, skipping a test, adding a lint suppression, or widening a type to `any` to get past an error: **forbidden**, always.
3. Edit only the files the errors point at, plus any file the Step 2 mapping predicted would need changing.
4. Re-run the three commands. If still not green, make another attempt, same rules.
5. If still not green after the third attempt, go to Step 9 (revert).

If a fix requires changing behavior a spec documents, stop and go to Step 9. That upgrade needs a planned change, and this task does not own it.

---

## Step 6 — Hunt the silent changes (the diligence step)

Everything is green. Now find what the build could not see. Work through the **silent list** from Step 2 and the **behavior contract** from Step 3, item by item — do not sample, do not stop early because the first few were fine.

For each silent change:

1. **Decide whether it reaches this project at all.** A changed default only matters if the project relies on the default rather than setting the value; a changed output format only matters if something consumes that output. Say which it is, from the code, not from intuition.
2. **Where it reaches us, pin the old behavior explicitly.** Set the value the old default provided, rather than leaving the call site depending on a default that has now moved. Explicit beats implicit here permanently, not just during the upgrade.
3. **Where it reaches user-visible output, check it against the spec.** Read the spec statement and the code path together and confirm the statement is still true. For output the tests do not cover, exercise it — run the relevant unit tests directly, or use `ai/tasks/workspace/` and the project's own run path to look at the actual output. A visual or textual diff against what the spec describes beats a plausibility argument.
4. **Check the error paths.** Changed error types and messages are the classic silent break: a `catch` that matched a specific error class, a check on `err.code`, a message string a test or a UI surface depends on. `grep` the call sites' error handling and confirm it still matches what the new version throws.

Record the outcome of every item on the list: not applicable, unchanged, or **pinned back** with the file you changed to do it. Every "pinned back" is a code change that must be covered by a test in Step 7.

If you find a behavior change you cannot pin back — the new version simply cannot do what the spec describes — go to Step 9 and revert. Do not update the spec to match the new behavior. Changing what the product does is a product decision, and it is not this task's to make.

---

## Step 7 — Add the tests the upgrade proved were missing

Every spec statement that Step 3 found unprotected, and every behavior you pinned back in Step 6, gets a test now — in the colocated test file for the module involved, matching the surrounding test style.

These tests are the durable output of this task. The upgrade is a one-time event; the test that pins the sanitizer's escaping rule, or the renderer's output shape, or the error type a `catch` depends on, is what stops the *next* upgrade from silently undoing it. Write the assertion against the behavior the spec describes, not against whatever the library currently emits.

Do not write tests that merely assert the new version's version number, and do not add broad snapshot tests that will churn on every future release.

Run the three commands from Step 5 again and confirm all three are still green with the new tests in place.

---

## Step 8 — Security review of the upgrade

A new major can change this project's exposure in ways that have nothing to do with its API. Check all of it:

1. **Advisories, before and after.** Run `npm audit 2>&1` and compare against the Step 1 baseline. The upgrade must not introduce a new advisory. If it closes one, say which in the report. A new advisory of any severity introduced by this upgrade is a revert (Step 9) unless it is already fixable by a patch bump within the new range, in which case apply that patch bump and re-run everything from Step 5.
2. **The dependency tree.** Read the `package-lock.json` diff for what came in with the upgrade: new transitive dependencies, new packages with install scripts, packages that were previously deduped and now are not. New install scripts are the highest-risk finding here — this project deliberately installs with `--ignore-scripts` (see `ai/tasks/workspace/prepare-workspace.md`) and any new lifecycle script must be named in the report.
3. **Ownership and provenance.** If the research in Step 2 showed the package changed maintainers, was transferred, or was rewritten by a new author between the installed and target versions, say so in the report explicitly. It does not block the upgrade on its own; it does mean a human should look.
4. **The security-relevant behavior itself.** If the package does sanitization, escaping, validation, authentication, crypto, shell invocation, PTY handling, or network work, re-check its configuration at every call site against the new version's documented defaults. Majors in this class routinely change what is allowed through. A sanitizer whose allow-list widened, a validator that now coerces instead of rejecting, a client that now follows redirects by default — each is a real exposure change that produces no error and no failing test.
5. **The upstream code diff — required, not optional.** You are adopting someone else's new code, and the changelog is their summary of it, not the code itself. Examine what actually changed in the package between the installed version and the target:

   ```bash
   npm pack <package>@<old-version> --pack-destination ./temp
   npm pack <package>@<target-version> --pack-destination ./temp
   ```

   Unpack both into `./temp` and diff the **shipped** files (`tar xzf`, then `diff -r`), and read the upstream repository's compare view (`https://github.com/<owner>/<repo>/compare/<old-tag>...<new-tag>`) via `WebFetch` for the source behind it. Where the shipped files are minified bundles, diff the source in the repository compare view instead and treat the bundle diff as a size/shape check only. Do not `grep`/`tail` a slow command's output repeatedly — capture once and read it (see [`CLAUDE.md`](../../../CLAUDE.md)).

   Read the diff for these specifically, and record what you find either way:
   - New or widened **network** access — new fetch/XHR/WebSocket/DNS calls, new endpoints, new telemetry or analytics, a client that now follows redirects or sends credentials cross-origin.
   - New **filesystem, process, or shell** access — `child_process`, `exec`, `spawn`, reading or writing paths outside the package, new environment-variable reads (especially tokens, `NODE_OPTIONS`, `PATH`).
   - New **dynamic code execution** — `eval`, `new Function`, `vm`, dynamic `import()` of a computed path, prototype writes, or newly obfuscated/unreadable code where readable code used to be.
   - Changed **input handling** — sanitization, escaping, encoding, path normalization, URL or regex parsing. A new or widened regex is also a ReDoS question; check it against the input this project actually feeds the package.
   - New **lifecycle scripts** in the package's own `package.json` (`preinstall`, `install`, `postinstall`), new binaries, or new bundled dependencies.
   - Removed **hardening** — a bounds check, a length limit, a validation branch, or a deny-list entry that is gone in the new version.

   A large diff is not an excuse to skip this. When it is genuinely too large to read line by line, say so in the report, and still read every hunk that touches the categories above — find them by searching the diff for those constructs rather than by reading start to finish.

6. **Your own diff.** Re-read every code change you made in Steps 5 and 6 with one question: does any of it weaken a check, broaden an input, swallow an error, or move a validation later? Adapting to a new API is a common place to lose a guard by accident.

If any finding here is a genuine exposure increase you cannot neutralize at the call site, go to Step 9 and revert.

**Every security finding — from any of the six checks above — goes into the PR body in Step 11, explicitly and in plain language.** That includes findings you judged acceptable and neutralized: a reviewer decides for themselves whether they agree with your judgment, and they can only do that if the finding is stated. Never bury a finding in a "no issues" summary, and never let "the tests pass" stand in for it. If the six checks genuinely produced nothing, say that as a finding of its own, naming what you checked.

---

## Step 9 — Revert (only if an earlier step sent you here)

```bash
cp package.json.bak package.json
cp package-lock.json.bak package-lock.json
npm install
```

Then undo every code and test change you made (`git checkout -- <file>` for tracked files; delete any file you created), confirm the three commands from Step 1 are green again on the restored baseline, and **stop**. Report the package, the target version, how far you got, and the specific finding that stopped you — the compiler errors that survived three attempts, the behavior that could not be pinned back, or the security finding. Do not try a lower target version as a consolation, and do not narrow the scope and try again in the same run; the next run can take a different target with fresh research behind it.

If you reached this step from Step 6 or Step 8, say so plainly in the report and, where the item came from the backlog, state that it should move to `## deferred` with the reason — that decision belongs to [`resolve-technical-debt.md`](../resolve-technical-debt.md), which owns the backlog file.

---

## Step 10 — Clean up and confirm the change is exactly what you intend

Delete the backups, and the tarballs and unpacked trees Step 8 left in `./temp/`:

```bash
rm package.json.bak package-lock.json.bak
rm -rf ./temp/*.tgz ./temp/package
```

Then read `git status` and `git diff` and confirm:

1. `package.json` shows exactly one widened range (plus the coordinated set from Step 2, if there was one) and nothing else.
2. Every source file changed is one Step 2 predicted or Step 5's compiler errors named. Nothing unrelated came along.
3. No test was weakened: no assertion loosened to accommodate the new version, no `skip`, no lint suppression, no `any` added to silence a type change.
4. No spec file was edited. If the upgrade changed documented behavior, you should have reverted in Step 6, not rewritten the spec.
5. `help.md` and `documentation/user-documentation/` are untouched, for the same reason.

If anything else changed on disk, revert it before continuing.

---

## Step 11 — Open a pull request for review (do not merge)

A breaking upgrade adopts new third-party code into the product, so a human approves it before it lands. Execute `ai/tasks/workspace/open-feature-pull-request.md` in full. That document owns the PR workflow — follow its steps without deviation, and **do not merge the PR**. Use commit type `build`, and name the package and both versions in the subject, e.g. `build: upgrade @xterm/xterm to 6.0.0`.

The PR body is the deliverable a reviewer reads before trusting the upgrade, so it replaces that document's feature-shaped sections with the ones below, in this order. Write it to `./temp/pr-body.md` as that document directs, using natural line breaks.

### What changed in the package

The heart of the description: **what the new version of the package actually does differently**, from the release history in Step 2 and the code diff in Step 8 — not a version-number announcement and not a paraphrase of the changelog headings. Cover the breaking changes and which of them reach this project, the behavioral changes that reach it silently, and anything the diff showed that the changelog did not mention. Say plainly how large the diff was and how much of it you read.

### Security

**Its own section, always present, never folded into the summary above.** Report all six checks from Step 8 — advisories before and after, the dependency tree, ownership and provenance, security-relevant behavior at the call sites, the upstream code diff, and your own diff — and state the result of each.

Any security issue must be **flagged explicitly**: name it, say where it is, say what an attacker would have to do to reach it, and say what you did about it. This applies to issues you neutralized as much as to ones you merely accepted; the reviewer, not you, decides whether the mitigation is enough. Lead the section with the issues when there are any — do not open with reassurance and mention them afterwards. When a check found nothing, say what you checked and that it was clean, rather than saying nothing at all.

### What changed in this project

The widened range and the coordinated set, every code change you made in Steps 5 and 6, and every behavior you pinned back — each with the file and the reason it was needed.

### Verification

The behavior contract from Step 3 and how each statement was confirmed, the tests added in Step 7 and what they pin, the compiler/lint/test results with the test count before and after, and anything you could **not** verify automatically — an untested surface is a thing the reviewer needs to know about, not a thing to leave out.

### Files changed

A concise summary of every file touched, grouped by area, with a one-line description of what changed in each.

*(When [`resolve-technical-debt.md`](../resolve-technical-debt.md) triggers this task, this step still runs and still opens a PR rather than merging — that task's Step 8 defers to the shipping choice made here. It runs it late, though: it stops at this step, finishes its own spec check and backlog edits first so they are in the working tree, and then comes back and runs it. The backlog edits and any deferrals ride in the same pull request, and its report carries the security findings from Step 8 forward.)*

---

## Step 12 — Report

```
Package:        <name>  <old-version> -> <new-version>
Range:          <old-range> -> <new-range> (widened)
Coordinated:    <sibling packages moved in the same change, or "none">
Code changes:   <files touched to adapt to the new API, or "none needed">
Behavior:       <silent changes checked: <count>; pinned back: <file — what was pinned>, … or "none reached this project">
Specs verified: <spec file(s) whose statements were re-checked, or "none applicable">
Tests added:    <count> across <files>, covering <what>
Upstream diff:  <how much of the version-to-version diff you read, and what it showed>
Security:       advisories <before> -> <after>; new transitive deps <count>; new install scripts <names or "none">; <each flagged issue and what you did about it, or "no exposure change found across all six checks">
Compiler:       green
Lint:           green
Tests:          green (<count> tests)
PR:             <url> (#<number>)
Status:         open — awaiting review
```

Flag any security issue in this report too, in the same words the PR body uses. A finding that appears only in the PR body is a finding the person reading this report will miss.

If you stopped early (no target named, target not a dependency, release too fresh, coordinated set too large, or a revert at Step 9), report that in two or three sentences: what you were attempting, which step stopped you, and the specific finding. Keep it brief. Done.
