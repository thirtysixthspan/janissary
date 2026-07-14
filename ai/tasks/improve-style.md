# Improve CSS Style (one fix per run)

Your job: run the CSS linter, pick the single most valuable fix, assess its risk, and either apply it yourself or ask the user to approve it. Do exactly **one fix**, then verify.

**No AI attribution — anywhere.** Never credit an AI agent as an author or contributor in anything this task produces. That means: no `Co-Authored-By:` trailers naming Claude or any other AI, no “Generated with Claude Code” (or similar) lines or badges, and no AI authorship notes in code, comments, docs, spec files, plan files, commit messages, or PR titles and bodies. This overrides any default convention that appends such attribution. The commit's configured git author is the only authorship ever recorded.

**Run everything synchronously, in the foreground.** Never use `run_in_background`, `&`, or otherwise start a background process (dev servers, watchers, long-lived processes) — every command must finish and return its exit code before you move to the next step.

**No subagents, no background agents.** Do every step yourself — never launch a subagent (Task/Agent tool, `fork`, or otherwise) to research, explore, or implement any part of this task on your behalf.

Do the steps below **in order**. Do not skip steps. Do not invent your own process.

**Shell hygiene:** run every command on its own line — no `&&` chaining, no `; echo "Exit code: $?"` suffixes, no subshell captures. The exit code and output are visible in the tool result. To run a project script, always use `./scripts/run.mjs <name>` — never call `node scripts/<name>.mjs` directly.

---

## Step 0 — Prepare the workspace

Execute `ai/tasks/prepare-workspace.md` in full before doing anything else.

---

## Step 1 — Verify the baseline is green

Run all three and read all output:

```bash
npx tsc --noEmit 2>&1
npm test 2>&1
npm run lint:css 2>&1
```

Record:
- **Compiler:** must finish with **no errors**. If it errors, STOP and tell the user.
- **Tests:** every test must pass. If any test is already failing, STOP and tell the user — do not fix CSS on a broken suite.
- **CSS lint (`npm run lint:css`):** copy out the full finding list — every line. Write down the total count. **If there are no findings, report "No CSS issues found" and stop.**

Always run these fresh. Do not trust earlier output in the conversation.

---

## Step 2 — Rank the findings

Read the `npm run lint:css` output. Each finding looks like:

```
web/src/theme.css
  137:27  ✖  Expected modern color-function notation   color-function-notation
```

Group findings by **stylelint rule name** (the last token on each line). For each rule, count how many findings it contributes.

Rank from most valuable to fix first, using this order of priority:

1. **Correctness** — deprecated values (`declaration-property-value-keyword-no-deprecated`), invalid syntax, unknown properties.
2. **Modernisation** — outdated but valid notation (`color-function-notation`, `alpha-value-notation`, `color-function-alias-notation`, `value-keyword-case`).
3. **Convention** — style rules the config-standard enables and that aren't purely about whitespace.

Within each tier, prefer the rule with the **most findings** (highest bang-for-buck per edit).

Write out your ranked list before picking.

---

## Step 3 — Pick exactly one rule to fix

From the ranked list, pick the **top rule** — the highest-priority finding with the most occurrences.

State: the rule name, how many findings it has, and in one sentence what the fix is.

---

## Step 4 — Plan the fix

Write out every individual change the fix requires:

- For each finding, the **file**, the **line**, what the current code is, and what it becomes.
- If `--fix` can apply the change automatically, say so.

Keep the diff as small as possible — do not reformat or tidy unrelated lines.

---

## Step 5 — Assess risk and decide

Rate the plan **Low risk** or **High risk** using these criteria.

**Low risk** (apply automatically, without asking):
- The change is a mechanical substitution: rewriting a color notation, quoting a font name, replacing a deprecated keyword with its modern equivalent.
- `--fix` applies it, or each change is a literal find-and-replace within the CSS file.
- Zero TypeScript, zero test files, zero config files are touched.
- The visual result in the browser is identical — no layout, color, or spacing change.

**High risk** (skip and pick the next rule):
- The fix could change rendered output — for example, changing a `color` value where the browser interprets the old and new forms differently, changing a `font-family` ordering, or restructuring a selector.
- More than one file must be edited.
- You are unsure whether the old and new forms are semantically identical.
- The fix requires deleting or restructuring a rule block, not just rewriting a value.

If **High risk**: do **not** apply the fix and do **not** ask the user. Go back to Step 3, remove this rule from the ranked list, and pick the next-ranked rule. If every rule is High risk, list all of them in your report under "Skipped (high risk)" and stop without making any changes.

If **Low risk**: proceed directly to Step 6 without asking.

---

## Step 6 — Apply the fix

**Back up the file first:**

```bash
cp web/src/theme.css web/src/theme.css.bak
```

Apply the fix:

- If `--fix` covers it: run `npm run lint:css:fix`, then inspect the diff to confirm only the intended lines changed. If the diff touches anything unexpected, restore the backup and report what happened.
- If manual: edit the file directly, changing only the lines listed in your plan.

---

## Step 7 — Verify (run in this order; everything must be green)

```bash
npx tsc --noEmit 2>&1
npm test 2>&1
npm run lint:css 2>&1
```

1. **Compiler — no errors.** If a type error appeared, the CSS change somehow affected a TypeScript file that wasn't supposed to change. Restore the backup and report.
2. **Tests — all pass.** If a test fails, restore the backup and report. Never edit a test to make it pass.
3. **CSS lint — the rule you fixed no longer appears.** The finding count must be lower than Step 1. If the same findings are still there, your fix did not take effect — restore the backup and report.

When all three pass, delete the backup: `rm web/src/theme.css.bak`.

---

## Step 8 — Report

```
Rule fixed:    <rule name, or "none — all rules were high risk">
Findings:      <count before> -> <count after>
Changes:       <one line per edit: file:line old → new, or "none">
Skipped:       <rules skipped as high risk, or "none">
Tests:         all pass / <what failed>
```

Keep it brief. Done.
