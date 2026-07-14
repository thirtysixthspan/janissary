# Remove Dead Code (clear all findings in one pass)

Your job: run Knip, delete the dead code it reports, then prove the project is still green. Dead-code removal is mechanical — you only ever **delete code that nothing uses**, never add or rewrite logic. Clear all the safe findings in one pass.

**No AI attribution — anywhere.** Never credit an AI agent as an author or contributor in anything this task produces. That means: no `Co-Authored-By:` trailers naming Claude or any other AI, no “Generated with Claude Code” (or similar) lines or badges, and no AI authorship notes in code, comments, docs, spec files, plan files, commit messages, or PR titles and bodies. This overrides any default convention that appends such attribution. The commit's configured git author is the only authorship ever recorded.

The rule is simple: **the compiler, the linter, and the tests must be green before you start and green again after you finish.** If the project is not green before you start, stop and tell the user. If you cannot keep it green, put the code back.

**Run everything synchronously, in the foreground.** Never use `run_in_background`, `&`, or otherwise start a background process (dev servers, watchers, long-lived processes) — every command must finish and return its exit code before you move to the next step.

**No subagents, no background agents.** Do every step yourself — never launch a subagent (Task/Agent tool, `fork`, or otherwise) to research, explore, or implement any part of this task on your behalf.

**Shell hygiene:** run every command on its own line — no `&&` chaining, no `; echo "Exit code: $?"` suffixes, no subshell captures. The exit code and output are visible in the tool result. To run a project script, always use `./scripts/run.mjs <name>` — never call `node scripts/<name>.mjs` directly.

Do the steps below **in order**. Do not skip steps. Do not invent your own process.

**Run autonomously.** This task runs unattended — do not ask the user questions or wait for feedback at any step. Make the best judgment call yourself, using the rules in this document, and keep going. Only stop early if the project isn't green before you start, or if you cannot keep it green after a removal (put the code back and report instead of pausing).

## The one safety rule (read this first)

There are two kinds of finding: **remove automatically** and **leave alone**.

### Remove automatically — never ask

You may remove these four kinds of finding on your own, start to finish, without stopping. Do **not** ask "Do you want me to proceed?". Do **not** wait for confirmation. Asking permission for safe removals is a mistake.

- **Unused dependency / devDependency** — remove the package from `package.json`.
- **Unused file** — delete the file (nothing imports it).
- **Unused export** — delete the whole declaration.
- **Unused exported type** — delete the whole type/interface.

### Leave alone — skip it and list it (do NOT remove)

Do **not** remove a finding if it is any of these. Just leave it in place and list it in your report. You never need to stop and ask in this task — skipping a piece of dead code is always safe.

- A finding in **`src/controller.ts`** (the biggest, riskiest file).
- A finding in **security, password/crypto, shell-execution, PTY/terminal, or network/browser** code.
- A finding you could only remove by **editing a test file** (`*.test.ts`, `*.test.tsx`).
- A finding whose removal looks like it would touch **more than 5 files**.
- A name you can see is used in a **non-obvious way** — referenced as a string, via dynamic `import()`, or by something outside this repo.

### Guardrails

- **Do NOT run `knip --fix`.** It removes everything it finds and ignores the "leave alone" list above. Remove findings by hand.
- **Act only on the four "unused" categories above.** If Knip prints any other kind of finding (`Unlisted dependencies`, `Unresolved imports`, `Duplicate exports`, `Unused class members`, …), do not touch it — just list it under "Other" in your report.
- Never edit `knip.json`, `tsconfig.json`, `eslint.config.mjs`, or `package.json` (except to remove an unused-dependency line). Never add `// @public` tags or `ignore` entries to silence a finding.

---

## Step 0 — Prepare the workspace

Execute `ai/tasks/prepare-workspace.md` in full before doing anything else.

---

## Step 1 — See the starting state (run these, write the numbers down)

```bash
npx tsc --noEmit 2>&1
npm test 2>&1
npm run lint 2>&1
npm run knip 2>&1
```

The first three must all be **green** before you touch anything:

- **Compiler (`npx tsc --noEmit`):** must finish with **no errors**.
- **Tests (`npm test`):** **every** test must pass.
- **Lint (`npm run lint`):** must report **no errors**. (Warnings are fine and do not count as red — the line `✖ 16 problems (0 errors, 16 warnings)` is green because errors is 0.)

**If any of those three is not green, STOP and tell the user. Do not remove dead code on a project that is not already green** — fixing a pre-existing failure is not your job here.

- **Knip (`npm run knip`):** this is your to-do list of findings. **If Knip reports no findings, there is nothing to do — report "No dead code found" and stop.**

Always run these fresh; do not trust earlier output in the conversation.

---

## Step 2 — Read the Knip findings

Knip groups findings under headers, like this:

```
Unused files (1)
src/old-feature.ts

Unused dependencies (1)
some-package  package.json

Unused exports (2)
helperFn  function  src/utils.ts:12:17
CONSTANT  unknown   src/config.ts:5:14

Unused exported types (1)
OldType  type  src/types.ts:42:13
```

For each finding note the **category**, the **file path**, and (for exports/types) the **line number**.

Two facts about how Knip is set up here:

- Because of the `ignoreExportsUsedInFile` setting, **every "unused export" Knip lists is used nowhere at all** — not in other files and not even in its own file. So the fix is always to **delete the entire declaration**, never just the `export` keyword.
- Test files already count as usage. If a test imports something, Knip will **not** list it — so you do not need to grep test files yourself.

---

## Step 3 — Decide what to remove

Go through every finding from Step 2 and sort it:

- If it is one of the four removable categories **and** none of the "leave alone" conditions apply → it goes on your **removal list**.
- Otherwise → it goes on your **skip list** (you will name these in the report, but not touch them).

You do not need to ask anyone. Just build the two lists and continue.

---

## Step 4 — Back up, then remove (safest first)

**Back up every file you will edit or delete** so you can restore it exactly:

```bash
cp src/foo.ts src/foo.ts.bak
```

Work through your removal list in this order:

### 1. Unused dependency / devDependency

Back up both lock and manifest first, because this also rewrites them:

```bash
cp package.json package.json.bak
cp package-lock.json package-lock.json.bak
```

Remove the one line for that package from `package.json`, then:

```bash
npm install
```

(To undo later: copy both `.bak` files back, then run `npm install` again.)

### 2. Unused file

Back it up, then delete it:

```bash
cp src/old-feature.ts src/old-feature.ts.bak
rm src/old-feature.ts
```

(First make sure the file is not named in a `package.json` script or in `bin` — if it is, skip it.)

### 3. Unused export / unused exported type

Open the file at the line Knip gave you and **delete the whole declaration** — the entire `function` / `const` / `type` / `interface`, from its first line to its closing brace.

- If the finding is a **re-export line** (`export { X } from './y.js'` or `export type { X } from './y.js'`), just delete that line (or only the one name, if the line lists several).
- Keep the diff minimal — do not reformat or tidy unrelated lines.

Do not chase down unused imports by hand right now — the linter in Step 5 will list any import that became unused, and you will delete those then.

---

## Step 5 — Verify (run in this order; everything must be green)

```bash
npx tsc --noEmit 2>&1
npm run lint 2>&1
npm test 2>&1
npm run knip 2>&1
```

Each command checks one thing. Fix or restore before moving on.

1. **Compiler — green (no errors).** An error like `Cannot find name 'X'` or `has no exported member 'X'`, naming something you removed, means it was **not** dead — a reference still exists. **Restore that finding's backup**, move it to your skip list, and re-run.
2. **Lint — green (no errors).** A new error is almost always an **import that became unused** after you deleted a declaration. The linter prints its file and line — delete that import line, then re-run. Never silence anything with an `eslint-disable` comment.
3. **Tests — green (all pass).** If a test now fails, something you removed was used in a way the compiler could not see. **Restore that finding's backup**, skip it, and re-run. Never edit a test to make it pass.
4. **Knip — the findings you removed are gone.** Re-running Knip should no longer list anything you removed. (Findings you deliberately skipped will still be listed — that is expected; they go in your report.)

The compiler, the linter, and the tests must all end **green**, exactly as they were in Step 1. When they are, **delete the backup files**: `rm *.bak src/**/*.bak` (and `package-lock.json.bak` if you made one).

---

## Step 6 — Report

Give the user a short report in this exact shape:

```
Removed:
  Dependencies:   <packages removed, or "none">
  Files:          <files deleted, or "none">
  Exports/types:  <count> removed, in <files>

Skipped (left in place): <findings you did not touch + one-word reason each, or "none">
Other Knip findings:     <non-"unused" findings, or "none">

Compiler:  green / <errors, if any>
Lint:      green / <errors, if any>
Tests:     green / <what failed>
Knip:      <N findings before> -> <N remaining (all deliberately skipped)>
```

Keep it brief. Done.
