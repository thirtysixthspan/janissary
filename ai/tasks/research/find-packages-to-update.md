# Find Packages to Update

Your job: find the npm dependencies that are behind their latest release at **minor** or **major** level — including the ones whose latest version sits **outside** the range `package.json` declares — research what upgrading each one would actually cost and buy, and log the worthwhile ones as new entries under the `## development` section of `product/backlog/technical-debt.md`. This task **researches and records** upgrade opportunities. It never installs a package, never edits `package.json` or `package-lock.json`, and never touches a source file. Resolving what lands here belongs to [`update-package-outside-range.md`](../hygiene/update-package-outside-range.md), and every entry you write says so explicitly.

The distinction that gives this task its reason to exist: [`update-packages-with-patches.md`](../hygiene/update-packages-with-patches.md) and [`update-package.md`](../hygiene/update-package.md) only ever move a dependency **within** its declared range, so anything whose `Wanted` already equals its `Current` is invisible to them — it sits at the top of the range forever while `Latest` drifts further ahead. Those are exactly the upgrades that need a human-grade judgment call before anyone starts, because they carry breaking changes, and that judgment is what this task produces. An entry here is a written argument: here is the version gap, here is what changed between the two versions, here is how much of our code touches it, here is what we gain, here is what could break, here is what it would cost.

**This task never changes what is installed.** Do not run `npm install`, `npm update`, `npm ci`, `npm audit fix`, or anything else that writes `package.json`, `package-lock.json`, or `node_modules/`. Read-only npm commands (`npm outdated`, `npm view`, `npm ls`, `npm audit`) are your instruments and you must use them. If a read-only command would modify the tree, do not run it.

**Do not run the project's build, lint, test, or quality machinery.** No `npm run lint`, `npm run typecheck`, `npm test`, `npm run check`, `npm run quality`, or `./scripts/run.mjs check-diff`. You are changing nothing, so there is nothing to verify, and an upgrade's real effect on the build is not knowable until the upgrade is installed — which is the resolving task's job, not yours. Plain read-only shell commands used to navigate (`ls`, `find`, `grep`, `wc -l`, `git log`) are fine.

This task edits **one file only**: `product/backlog/technical-debt.md`, and only its `## development` section. You will never touch application source code, tests, specs, documentation, or config, and you will never modify the `## ready`, `## deferred`, or `## declined` sections.

**No AI attribution — anywhere.** Never credit an AI agent as an author or contributor. No `Co-Authored-By:` trailers naming Claude or any other AI, no "Generated with Claude Code" lines or badges, no AI authorship notes anywhere in the files you write. The commit's configured git author is the only authorship ever recorded.

Do the steps below **in order**. Do not skip steps. Do not invent your own process.

**Run autonomously.** Do not ask the user questions or wait for feedback at any step.

---

## Background — what makes an upgrade worth logging

Staying on an old major version is a debt position, not a neutral state. The interest accrues quietly: security fixes stop being backported, the ecosystem's plugins and type packages move on, the migration guide gets longer with every release you skip, and eventually the upgrade you deferred as "not worth it" becomes a multi-day forced march because something else you need requires it. That is the cost side of the ledger you are writing down.

But not every available major bump is debt. A dependency that is pinned behind deliberately, or one whose new major only adds features the project has no use for, is a fine place to be. Four questions decide whether a gap is worth an entry:

- **What do we actually gain?** Security fixes and dropped-support deadlines are the strongest reasons. Real bug fixes affecting code paths this project uses come next. New features the project would use come after that. "It's newer" is not a reason and must never be the justification in an entry.
- **What is the blast radius here, specifically?** A package imported in two files behind a thin wrapper is a different proposition from one whose types thread through forty modules. Measure this in *this* codebase — a breaking change the release notes call severe may not touch any API the project uses, and a change the notes barely mention may hit the one call this project makes everywhere.
- **What breaks, concretely?** Read the changelog and the migration guide, then map each breaking change onto real usage. An entry that says "v7 has breaking changes" is worthless. An entry that says "v7 removes the `foo()` callback form, which `src/a.ts` and `src/b.ts` both use" is a work order.
- **Is the ground under it solid?** A major release two weeks old, a package whose maintainer changed hands, a rewrite that shed most of its test suite, a new major that pulls in a pile of new transitive dependencies or new install scripts — each is a reason to log the item as *wait and watch*, or to not log it at all.

Judge value against cost. High-value/low-blast-radius items are what this backlog is for.

---

## Step 0 — Prepare the workspace

This task reads files, runs read-only npm queries, does external research, and runs git. It never builds, tests, or installs. So:

1. `git checkout master` and `git pull origin master`.
2. **Do not run `npm install`.** The read-only npm commands in Step 2 work against the manifest and the registry, and a stale `node_modules/` is still good enough for the source-reading in Step 4. If `node_modules/` is missing entirely, note it and rely on the registry and external sources instead of local package source.
3. Confirm a clean starting point with `git status`.

The working tree **must be clean** — no modified *and no untracked* files. This matters more than usual here: the quick-commit step at the end stages everything with `git add -A`, so any stray file would be silently swept into this task's commit. If the tree is not clean, STOP and report what is there — do not start on top of changes you did not make.

**Command hygiene for the whole run:** run each command plainly and read its output from the result — no piping into `tail`/`head`, no `>` redirects, no `$(...)` capture. These trigger permission prompts or hook rejections in this repo (see CLAUDE.md) and cost a wasted call each time.

---

## Step 1 — Load the existing backlog

Read `product/backlog/technical-debt.md`. It has flat sections — `## ready`, `## development`, `## deferred`, `## declined` — each a plain `*` bullet list with no IDs or scores.

Collect every existing bullet from all sections into one list. This is your dedupe set. If a package is already logged as an upgrade candidate anywhere in the file, skip it this run — including when it sits in `## deferred` or `## declined`, which means someone already looked and said not now. Also skip a package named in a bullet about something else when the upgrade would collide with that bullet's proposal — a library slated for replacement should not also be logged for upgrade.

---

## Step 2 — Find the version gaps

Run each of these **once** and read the full output:

```bash
npm outdated 2>&1
npm audit 2>&1
```

A non-zero exit from either is normal when they list rows — it is not a failure.

`npm outdated` prints `Package`, `Current`, `Wanted`, `Latest`. This task cares about the gap between **`Current` and `Latest`**, which is the opposite of the in-range tasks:

1. Keep every row where `Current` and `Latest` differ by a **major** or **minor** component. Patch-level gaps are [`update-packages-with-patches.md`](../hygiene/update-packages-with-patches.md)'s work — leave them alone.
2. **Include rows where `Wanted` equals `Current`.** Those are the whole point: the declared range cannot reach `Latest`, so no in-range task will ever move them, and only [`update-package-outside-range.md`](../hygiene/update-package-outside-range.md) can.
3. Rows where the whole gap is already in range (`Wanted` equals `Latest` and both differ from `Current` at minor level) are still eligible — but note in the entry that the range already allows it, because that upgrade needs no range change and is correspondingly cheaper.

From `npm audit`, note any advisory that names one of these packages, and whether the fix requires a major bump. A dependency with an open advisory whose only fix is out of range is the strongest candidate this task can find.

Record for every surviving row: package name, `Current`, `Wanted`, `Latest`, whether it is a `dependency` or `devDependency`, the declared range from `package.json`, and any advisory against it.

---

## Step 3 — Research each candidate's release history

For each candidate, find out what actually changed between `Current` and `Latest`. Use the package's own material first — its changelog, release notes, and migration guide are written by the people who made the breaking changes:

```bash
npm view <package> versions --json 2>&1
npm view <package> time --json 2>&1
npm view <package> repository homepage deprecated dependencies engines 2>&1
```

From that, get the release dates (how old is `Current`? how new is `Latest`? a major released last week is not a safe target), the repository URL, whether the installed version is deprecated, and whether the new version's `engines` field still matches this project's Node version.

Then read the sources that explain the changes:

- `node_modules/<package>/CHANGELOG.md` if it exists — often the fastest complete answer.
- The repository's releases page and `CHANGELOG.md`, and any `MIGRATION.md` / upgrade guide, via `WebFetch`.
- `WebSearch` for the specific migration when the changelog is thin: e.g. `"<package> v6 to v7 migration breaking changes"`. Read enough of each result to confirm a breaking change is real and what it requires — a claimed breaking change that does not exist makes the entry worse than no entry.

Collect, for each major or minor boundary crossed: the breaking changes, the removed or renamed APIs, the changed defaults, the dropped runtime/platform support, and the security fixes. Note anything that changes behavior silently rather than loudly — a changed default or a changed escaping/sanitization rule is far more dangerous than a removed export, because the compiler will not catch it.

---

## Step 4 — Measure the blast radius in this codebase

A changelog describes the package. This step describes *us*. For each candidate:

1. Find every import of the package across `src/`, `web/src/`, `scripts/`, and config files (`grep` for the package name; remember config files like `eslint.config.mjs`, `vitest` config, and `vite` config count).
2. Note the count of files and, more importantly, **which APIs of the package this project actually calls**. Read enough of the call sites to list them.
3. Cross-reference against the breaking changes from Step 3. Each breaking change is either **hits us** (name the files) or **does not apply** (say so). This mapping is the substance of the entry.
4. Note whether the usage is concentrated behind a wrapper module or spread across the codebase. Concentrated usage makes an upgrade dramatically cheaper and should be said out loud.
5. Note which `product/specs/` files describe behavior the package produces. An upgrade to a markdown renderer, a sanitizer, a terminal emulator, or a parser can change user-visible output, and the resolving task has to defend that behavior — tell it where the behavior is written down.
6. Note whether the package is a runtime `dependency` (ships to users, so behavior and security risk are real) or a `devDependency` (a break shows up as a red build, not a shipped bug). This is the single biggest factor in severity.

Also check for the ecosystem coupling that turns one upgrade into several: a peer dependency that pins the old major, a companion `@types/*` package, a plugin ecosystem versioned in lockstep (`eslint` and its plugins, `vite` and its plugins, `react` and `react-dom` and `@types/react`). If the upgrade only works as a coordinated set, the entry must name the whole set — an entry that names one package of a five-package upgrade sends someone into a wall.

---

## Step 5 — Filter out what should not be logged

Drop any candidate where:

1. **Patch-level only.** Already owned by [`update-packages-with-patches.md`](../hygiene/update-packages-with-patches.md).
2. **The gain is only "it's newer."** No security fix, no bug fix touching a path this project uses, no feature the project would use, no dropped-support deadline approaching. Currency for its own sake is not debt.
3. **The new version is too fresh to trust.** A major published within the last few weeks, still collecting its own patch releases. Say nothing now; it will still be there next run.
4. **The package is being replaced or removed** by an item already in the backlog, or by work visibly in progress in `git log`.
5. **The new version drops support for something this project requires** — a Node version below what `package.json` `engines` or CI demands, a platform, a module format. That is not an upgrade, it is a blocker; leave it out rather than filing work that cannot be done.

A candidate that is risky but valuable is **not** filtered out — it is logged with the risk stated plainly. Specifically, flag as **behavior-sensitive** any package whose output users can see or whose failure has security consequences: sanitizers, markdown/HTML renderers, parsers, terminal emulators, crypto, auth, network, shell, and PTY libraries. A behavior-sensitive entry says so in its own sentence, and never carries a severity above **medium** — not because it matters less, but because it must not be picked up as a quick win.

What survives is your candidate list.

---

## Step 6 — Bound the run

Cap this run at **5 new entries**. [`update-package-outside-range.md`](../hygiene/update-package-outside-range.md) resolves one package per run and each run is a genuine piece of work, so five is already several sessions, and a longer list goes stale as releases keep landing.

If more than five candidates survive Step 5, keep the five with the strongest case, in this order: open security advisories fixable only out of range, then deprecated or unmaintained installed versions, then the largest version gaps on runtime dependencies, then everything else by value against blast radius. Do not pad the list to hit the cap.

Finding zero candidates is a valid outcome. It means every gap is patch-level, already logged, or not worth taking. Do not invent an upgrade case that is not there.

---

## Step 7 — Write each entry

Match the existing style in `product/backlog/technical-debt.md`: one `*` bullet, one paragraph, concrete and evidence-bearing, no IDs and no scores beyond the severity rating. These entries run longer than most backlog items and that is intended — the whole value of this task is that whoever picks the item up does not have to redo the research. Reference files by path only, never by line number: the files move, the facts don't.

Each bullet must:

- Name the package, the installed version, the target version, and the declared range — and say plainly whether the target is **outside** that range (so the range has to be widened) or already inside it.
- Say what the upgrade buys, concretely: the advisory it closes, the bug it fixes on a path this project uses, the feature the project would adopt, the deprecation deadline it beats. If there is no such reason, the entry should not exist.
- Give the blast radius from Step 4: how many files import it, which of its APIs this project calls, and whether usage is concentrated behind a wrapper or spread out.
- Map each relevant breaking change onto this codebase — which files it hits, or that it does not apply. Call out any change that alters behavior **silently** (a changed default, a changed escaping or sanitization rule) separately from changes the compiler will catch, because those are what the resolving task has to hunt for by hand.
- Name the coordinated set if the upgrade needs one (peer deps, `@types/*`, lockstep plugins), or say it stands alone.
- Name the `product/specs/` file(s) describing behavior the package produces, or say none applies.
- Say whether it is a runtime `dependency` or a `devDependency`.
- **Say plainly if the package is behavior-sensitive** (see Step 5) and why. Omit this sentence only when it genuinely is not.
- Give an effort estimate in one clause — roughly how much code has to change, and whether the migration guide covers it or the project is on its own.
- **Carry the trigger sentence, verbatim in this form:**

  ```
  Resolve by running the `ai/tasks/hygiene/update-package-outside-range.md` task against <package> at <target-version>.
  ```

  Every entry needs it, and the wording is not optional. [`resolve-technical-debt.md`](../resolve-technical-debt.md) routes an item to a hygiene playbook **only** when the entry names the playbook like this — an item that merely describes an old dependency gets hand-planned instead, which is not what you want here. Naming the target version in the sentence matters too: `Latest` will have moved by the time anyone picks this up, and the entry's research is about the version you researched, not whatever is newest that day.
- Carry a severity rating.

Rate severity by what the outdated version is costing now, not by how far behind it is:

| Severity | Meaning |
|----------|---------|
| **high** | An open security advisory fixable only by this upgrade, or a runtime dependency whose installed version is deprecated or unmaintained, or support ending on a date already visible. The cost is being paid now. |
| **medium** | A real gain — fixes, features the project would use, or a gap wide enough that deferring makes the eventual migration materially worse. Also the ceiling for any behavior-sensitive entry, and for any `devDependency`, however far behind. |
| **low** | Worth tracking, nothing is on fire: a modest gap, a tooling package, an upgrade whose only benefit is that the next one gets easier. |

An entry in the right shape reads roughly like this:

```
* Upgrade `@xterm/xterm` from 5.5.0 to 6.0.0 — a runtime dependency whose declared range (`^5.5.0`) cannot reach it, so the range has to be widened. v6 drops the deprecated `Terminal.setOption()` in favour of the `options` accessor and changes the default `scrollback` handling on resize; 9 files import it, all of them through `src/terminal/`, and only `src/terminal/session-view.ts` calls `setOption()` (four call sites, mechanical to convert). The scrollback default is the silent one: nothing will fail to compile, but `product/specs/terminal-tab.md` documents scroll-position behavior on resize that has to be re-verified by hand after the bump. The upgrade is a coordinated set — `@xterm/headless` and `@xterm/addon-fit` are versioned in lockstep and must move to their matching v6/v0.11 releases in the same change. This is behavior-sensitive: the terminal emulator renders everything a user sees in a harness tab, so a rendering regression is a user-visible bug, not a red build. Effort is moderate; the project publishes a v5-to-v6 migration guide covering both changes. Resolve by running the `ai/tasks/hygiene/update-package-outside-range.md` task against `@xterm/xterm` at 6.0.0. Severity: **medium**.
```

---

## Step 8 — Integrate into the `## development` section

Open `product/backlog/technical-debt.md` and add your new bullets to the end of the `## development` section only. Leave `## ready`, `## deferred`, and `## declined` exactly as they are — do not reorder, reword, or remove anything in any section, including `## development`'s existing entries.

Before moving on, verify:

1. `git status` shows `product/backlog/technical-debt.md` as the **only** changed file. `package.json`, `package-lock.json`, and anything under `node_modules/` must not appear — if one does, you installed something, which this task never does. Revert it.
2. `git diff` shows the only changes are new lines appended inside `## development` — nothing removed, nothing changed elsewhere in the file.
3. Every new bullet names its package, its installed and target versions, and carries the trigger sentence in the exact form given in Step 7, target version included.
4. Every behavior-sensitive bullet says so, and none of them is rated **high**. No `devDependency` entry is rated **high**.
5. None of the new bullets duplicate an item from Step 1's dedupe set.

If anything else changed on disk, revert it (`git checkout -- <file>`) before committing.

---

## Step 9 — Commit and push

Execute [`quick-commit.md`](../workspace/quick-commit.md) in full to commit the result on `master` and push it to the remote. Use a `chore` type subject, e.g.:

```
chore(backlog): log out-of-range package upgrade opportunities
```

(The workspace was checked out on `master` in Step 0, so the quick-commit push lands the change directly on `master` remote — no separate merge step is needed.)

---

## Step 10 — Report

Give the user a short report in this exact shape:

```
Version gaps found:    <count of minor/major rows from Step 2> (<count> of them out of range)
Advisories:            <count of npm audit advisories naming a candidate, or "none">
Filtered out:          <count> (<package>: <one-line reason>, …)
New entries added:     <count> (to product/backlog/technical-debt.md, ## development)
Entries:               <one line per new entry: package, current -> target, dependency/devDependency, severity, "behavior-sensitive" if it is — or "none found">
Commit:                <short-sha> pushed to master | push failed (see above)
```

Keep it brief. Done.
