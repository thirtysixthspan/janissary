# Improve a Draft Plan (one plan per run)

Your job: take **one** plan from `docs/plans/draft/`, check every claim it makes against the real codebase, and edit the plan so an implementer is less likely to go wrong — then assess its complexity and record it at the top of the plan. You improve the **plan document only**; you change no source code.

This is a **planning** task, not pre-implementation. A good plan decides *what* to build, *where* it goes, and *which existing code to reuse* — it does not write the code. The implementer writes the code.

Do the steps below **in order**. Do not skip steps. Do not invent your own process.

**Shell hygiene:** run every command on its own line — no `&&` chaining, no `; echo "Exit code: $?"` suffixes, no subshell captures. To run a project script, always use `./scripts/run.mjs <name>` — never call `node scripts/<name>.mjs` directly.

## What you may and may not do

### Allowed — do it automatically, never ask

Edit the **one plan file** you picked: correct it, disambiguate it, restructure it, and add the complexity line. Read anything in the repo you need to verify the plan's claims. When the work is only this, carry it out start to finish without stopping — do **not** ask "Do you want me to proceed?", do **not** pause for approval.

### Forbidden — no exceptions

1. **Adding code to the plan.** Never add implementation code blocks — no function bodies, no method implementations, no JSX/CSS blocks, no "here's the code to write". Name the module, function, or type and describe its contract and behavior in prose instead. (Illustrative examples of *observable output* — a CLI transcript, an error message the user will see, an ASCII sketch of UI — are fine. A type or code the implementer would paste is not.) If the draft already contains implementation code, you may leave it, but do not extend it; if it contradicts what you verified in the repo, replace it with a prose description rather than corrected code.
2. **Editing any file other than the chosen plan.** No source, no tests, no config, no other plans.
3. **Moving the plan out of `docs/plans/draft/`.** Promotion to `ready/` is the human's status decision (see the plan-storage section in [`CLAUDE.md`](../CLAUDE.md)).
4. **Deciding product scope.** If the plan's *goal* seems wrong or not worth doing, say so in your report — do not rewrite the goal.

---

## Step 1 — Pick the plan

- If you were pointed at a specific plan file, use that one.
- Otherwise list `docs/plans/draft/`. Exactly one plan there → that is your target. More than one → report the list and stop (the human picks). None → report that and stop.

State your pick in one sentence.

---

## Step 2 — Read the plan, then read the code it talks about

1. Read the entire plan.
2. For **every** file path, function, type, command, line anchor, and behavioral claim the plan makes, open the real thing and check it. Grep for symbols rather than trusting quoted line numbers — line anchors drift.
3. Read the project constraints that shape any implementation here: the ESLint rules and file-size limit in [`CLAUDE.md`](../CLAUDE.md) (200-line `max-lines`, `.js` import extensions in `src/`, type-aware rules), and the test conventions (`src/**/*.test.ts`, `web/src/**/*.test.tsx`).
4. Skim one or two plans in `docs/plans/ready/` to match the house style — they follow a shape like: Goal, Design decisions, "What already exists (reuse, don't rebuild)" table, Implementation steps, Tests, Verification, Out of scope.

---

## Step 3 — Find the ways an implementer could go wrong

Judge the plan against each of these. Take notes; you will fix them in Step 4.

- **Wrong or stale references.** Paths, symbols, or line anchors that don't match the repo. These silently derail an implementation.
- **Missed call sites and paths.** The plan changes behavior at one site, but the behavior has other entry points the plan never mentions. Grep for every caller/consumer of what the plan touches and check the plan accounts for each.
- **Ambiguity.** Any step a reasonable implementer could read two ways; vague verbs ("handle errors", "update the UI") with no stated behavior; names left unchosen.
- **Undecided decisions.** Choices the implementer would be forced to make mid-flight — file placement, naming, edge-case behavior, error handling, what happens on the empty/duplicate/oversized input. Plans decide; implementers execute. Make the decision (grounded in how the codebase already does it) and write it into the plan as prose.
- **Unstated dependencies and ordering.** Does it depend on another plan landing first? Must its steps land in a particular order to keep typecheck/tests green at each checkpoint? Say so explicitly.
- **Constraint collisions.** Will a touched file blow the 200-line limit (plan an extraction, don't leave it to chance)? Do proposed imports follow the `.js`-extension rule? Would the approach trip a lint rule from `eslint.config.mjs`?
- **Reuse blindness.** Does the plan rebuild something the repo already has? Every mechanism the plan needs that already exists should be named with its location — a "What already exists (reuse, don't rebuild)" table is the house pattern.
- **Testing gaps.** Behavior the plan changes with no test that would catch a regression, or tests named without their location/convention.
- **Missing boundaries.** No "Out of scope" section, or a goal that quietly grows mid-document.
- **Missing verification.** The plan should end with how to verify: `./scripts/run.mjs check-diff` during development plus a concrete manual end-to-end check.

---

## Step 4 — Improve the plan

Edit the plan file to remove everything you found. Rules of thumb:

- Every sentence you add must close off a way to go wrong or record a decision that was open. If it does neither, don't add it.
- Anchor references as `path:line` **plus** the quoted identifier or code fragment, so the reference survives line drift.
- Prefer "do it like `<existing thing>` at `<location>`" over describing a mechanism from scratch — pointing at a working example in the repo is the strongest ambiguity-killer that adds no code.
- Do not rewrite sections that are already precise; keep the author's structure and voice where it works. This is an edit pass, not a rewrite.
- Use natural line breaks — never wrap lines at a fixed column (per `CLAUDE.md`).

---

## Step 5 — Assess and record complexity

Rate the (now improved) plan **1–10** for implementation complexity. Calibration, consistent with the ratings on the plans in `docs/plans/ready/`:

- **1–2** — one small module or pure wiring; no new protocol/persistence/UI surface. (`cli-help-version`, `prompt-click-prefill` are 2s.)
- **3–4** — small feature, but correctness depends on catching several call sites or coordinating with other plans; or it spans server and web with a new RPC or persistence field. (`unread-badge` is a 3, `tab-name-alias` a 4.)
- **5–7** — a new subsystem or protocol surface, many touched files, real state-machine or concurrency reasoning.
- **8–9** — a major feature: multiple new modules on both sides, novel interaction logic, first-of-its-kind surface in the app. (`editor-tab` is a 9.)
- **10** — architecture-level overhaul touching most of the system.

Record it directly under the plan's `#` title as a single line:

```
**Complexity: N/10** — <one-line rationale naming what drives the number>
```

If the plan already has a complexity line, update it — after your improvements the number may have changed.

---

## Step 6 — Verify and report

1. `git status` / `git diff` — confirm the **only** modified file is the plan (untracked plan files: confirm nothing else changed).
2. Re-read your edits once: no implementation code added, every decision you made is stated as a decision (not hedged with "maybe" or "either"), complexity line present and formatted as above.

Then give the user a short report in this exact shape:

```
Plan:        docs/plans/draft/<file>
Complexity:  N/10 — <rationale>
Fixed:       <short bullets — each wrong reference corrected, ambiguity resolved, decision made, gap filled>
Open:        <anything only the human can decide, e.g. scope doubts — or "nothing">
```

Keep it brief. Done.
