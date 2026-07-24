# Improve a Draft Plan for Minimalism (one plan per run)

Your job: take **one** plan from `./product/plans/draft/` and run its design decisions and implementation steps through a laziness ladder — cutting anything the plan builds that doesn't need to exist, reusing what the codebase already has, and preferring the smallest correct mechanism at every choice point — then record the result at the top of the plan. You improve the **plan document only**; you change no source code.

**Project `./product/` directory.** Every `./product/...` path in this task refers to the product directory in the current working directory — the project being worked on — never to the Janissary codebase's own `product/` directory, even when this task file was launched from an absolute path inside the Janissary installation.

This is a **planning** task, not pre-implementation. A good plan decides *what* to build, *where* it goes, and *which existing code to reuse* — it does not write the code. The implementer writes the code.

This task is a sibling of [`improve-plan.md`](improve-plan.md), not a replacement for it: that task hunts for wrong references and unresolved ambiguity; this one hunts for over-building. Run both on a plan if it needs both passes — they don't conflict, since this task never touches correctness fixes and that one never touches scope.

Do the steps below **in order**. Do not skip steps. Do not invent your own process.

**Run autonomously.** This task runs unattended — do not ask the user questions or wait for feedback at any step. Make the best judgment call yourself, using the rules in this document, and keep going. Only stop early for the conditions explicitly listed under "Forbidden" below.

## The ladder

Before a plan proposes any new module, function, file, dependency, or abstraction, it should be able to justify surviving to the first rung below that actually holds. This task's whole job is checking that and rewriting the plan where it doesn't:

1. **Does this need to exist at all?** If a planned piece of work isn't needed to satisfy the plan's stated goal, cut it (YAGNI) — don't shrink it, remove it.
2. **Does it already exist in this codebase?** If an existing helper, module, or pattern already does this, the plan should point at it (`./product/plans/ready/` plans call this the "What already exists (reuse, don't rebuild)" table), not describe building a new one.
3. **Does the standard library already do this?** Prefer language/runtime stdlib over a hand-rolled equivalent.
4. **Does a native platform feature cover it?** Prefer what the platform (Electron, the browser, the OS, the terminal) already gives you over a library or custom implementation.
5. **Does an already-installed dependency solve it?** Prefer a dependency already in `package.json` over adding a new one, and over hand-rolling what it already does.
6. **Can this be one line, or a few?** Prefer the smallest mechanism that is still correct over a more elaborate one that isn't needed.
7. **Only then:** the plan may describe new code as the minimum needed to satisfy the goal.

The ladder runs *after* the plan is understood, not instead of understanding it — Step 2 below reads the plan and the code it touches before any rung is applied, exactly as `improve-plan.md` does.

**Never cut on the plan's behalf:** input validation at trust boundaries, error handling that prevents data loss, security, accessibility, anything the plan's goal explicitly asked for, or a design decision the plan already made for a stated, checkable reason. Laziness is about not building what wasn't needed — it is not a license to drop safety, correctness, or scope the human actually wants. If cutting something would change what the plan's own goal promises, don't cut it — flag it under "Open" instead (see Step 6).

A rung the plan already sits on doesn't need touching. This task only intervenes where the plan reaches further down the list than the codebase requires.

## What you may and may not do

### Allowed — do it automatically, never ask

Edit the **one plan file** you picked: cut unneeded scope, replace a described-from-scratch mechanism with a pointer at existing code/stdlib/platform/dependency, simplify an over-elaborate design decision, and add the complexity line. Read anything in the repo you need to verify a reuse claim or confirm something truly isn't needed. When the work is only this, carry it out start to finish without stopping — do **not** ask "Do you want me to proceed?", do **not** pause for approval.

### Forbidden — no exceptions

1. **Adding code to the plan.** Never add implementation code blocks — no function bodies, no method implementations, no JSX/CSS blocks, no "here's the code to write". Name the module, function, or type and describe its contract and behavior in prose instead. (Illustrative examples of *observable output* — a CLI transcript, an error message the user will see, an ASCII sketch of UI — are fine. A type or code the implementer would paste is not.)
2. **Editing any file other than the chosen plan.** No source, no tests, no config, no other plans.
3. **Moving the plan out of `./product/plans/draft/`.** Promotion to `ready/` is the human's status decision (see the plan-storage section in [`CLAUDE.md`](../../../CLAUDE.md)).
4. **Cutting anything the goal actually requires.** If trimming a piece would make the plan fail to deliver what its own goal promises, or would drop validation, error handling, security, or accessibility, leave it and say so in your report instead — do not cut it to make the plan smaller.
5. **Deciding product scope.** If the plan's *goal* itself seems too broad, say so in your report — do not rewrite the goal.

---

## Step 0 — Prepare the workspace

Execute `ai/tasks/prepare-workspace.md` in full before doing anything else.

---

## Step 1 — Pick the plan

- If you were pointed at a specific plan file, use that one.
- Otherwise list `./product/plans/draft/`. Exactly one plan there → that is your target. More than one → report the list and stop (the human picks). None → report that and stop.

State your pick in one sentence.

---

## Step 2 — Read the plan, then read the code it talks about

1. Read the entire plan.
2. For every new module, function, file, or dependency the plan proposes, open the real codebase around it: check whether a helper, util, or pattern already covers the same need, and what the relevant stdlib/platform/existing-dependency options actually are. Grep for symbols rather than trusting quoted line numbers — line anchors drift.
3. Read the project constraints in [`CLAUDE.md`](../../../CLAUDE.md): the 200-line file-size limit and its guidance to extract rather than compact, the ESLint rules, and the general instruction not to add abstractions, error handling, or validation for scenarios that can't happen.
4. Skim one or two plans in `./product/plans/ready/` to match the house style, in particular their "What already exists (reuse, don't rebuild)" tables.

---

## Step 3 — Climb the ladder against every planned piece of work

Go design decision by design decision, implementation step by implementation step. For each one that proposes new code, a new file, a new dependency, or a new abstraction, check it against the ladder in order and note the first rung it should have stopped at:

- **Rung 1 — unneeded entirely.** Work that isn't required to satisfy the plan's stated goal. Note it for removal.
- **Rung 2 — already in the codebase.** A helper, module, component, or pattern that already does this, that the plan describes rebuilding instead of reusing. Note the existing location.
- **Rung 3 — stdlib covers it.** A hand-rolled utility (date/string/collection handling, etc.) that the language or Node.js standard library already provides.
- **Rung 4 — a native platform feature covers it.** Something the plan proposes as custom UI or logic that Electron, the browser, the OS, or the terminal already provides.
- **Rung 5 — an installed dependency covers it.** A new dependency proposed where an existing one in `package.json` already solves the problem, or hand-rolled logic duplicating what an existing dependency does.
- **Rung 6 — collapses to a one-liner or a few lines.** A described mechanism that is more elaborate than the actual need — an interface, config layer, or multi-step process built for a single call site with no stated reason to generalize.
- **No rung fires — genuinely new code, at the minimum needed.** Leave it; this is what Step 4 will *not* touch.

Also check for the ladder's own guardrails while you go:

- **Non-negotiables left intact.** Confirm no rung you're about to apply would cut input validation at a trust boundary, error handling that prevents data loss, security, or accessibility — these survive regardless of what rung would otherwise fire.
- **Deliberate cuts need a marker.** If the plan itself already documents a corner it intends to cut (e.g. "single global lock for v1", "linear scan, fine at this scale"), it should name the ceiling and the upgrade path — mirroring a `ponytail:`-style comment, but as plan prose rather than code. If the plan cuts a corner silently, that's a gap to fill in Step 4, not a reason to remove the cut.

Take notes; you will act on them in Step 4.

---

## Step 4 — Trim the plan

Edit the plan file according to your Step 3 notes:

- **Rung 1 hits:** remove the unneeded work outright — the section, step, or sentence describing it, not just a note that it's optional.
- **Rung 2–5 hits:** replace the from-scratch description with a pointer at the existing helper/stdlib function/platform feature/dependency, naming its location the same way `improve-plan.md` anchors references (`path:line` plus the identifier). Add or extend the "What already exists (reuse, don't rebuild)" table if the plan doesn't already have one.
- **Rung 6 hits:** rewrite the design decision to describe the smaller mechanism directly, in prose — still no code blocks.
- **Silent corner-cuts found in Step 3:** add one sentence naming the ceiling and the upgrade path, so a deliberate simplification reads as deliberate instead of accidental.
- Leave everything Step 3 found no rung for exactly as it is — this is a trimming pass, not a rewrite. Do not touch sections that were already minimal.
- Use natural line breaks — never wrap lines at a fixed column (per `CLAUDE.md`).

---

## Step 5 — Assess and record complexity

Rate the (now trimmed) plan **1–10** for implementation complexity. Calibration, consistent with the ratings on the plans in `./product/plans/ready/`:

- **1–2** — one small module or pure wiring; no new protocol/persistence/UI surface. (`cli-help-version`, `prompt-click-prefill` are 2s.)
- **3–4** — small feature, but correctness depends on catching several call sites or coordinating with other plans; or it spans server and web with a new RPC or persistence field. (`unread-badge` is a 3, `tab-name-alias` a 4.)
- **5–7** — a new subsystem or protocol surface, many touched files, real state-machine or concurrency reasoning.
- **8–9** — a major feature: multiple new modules on both sides, novel interaction logic, first-of-its-kind surface in the app. (`editor-tab` is a 9.)
- **10** — architecture-level overhaul touching most of the system.

Record it directly under the plan's `#` title as a single line:

```
**Complexity: N/10** — <one-line rationale naming what drives the number>
```

If the plan already has a complexity line, update it — trimming should usually only lower the number, never raise it.

---

## Step 6 — Verify and report

1. `git status` / `git diff` — confirm the **only** modified file is the plan (untracked plan files: confirm nothing else changed).
2. Re-read your edits once: no implementation code added, nothing cut that the goal actually required or that touched validation/error-handling/security/accessibility, every reuse pointer actually resolves to a real location, complexity line present and formatted as above.

Then give the user a short report in this exact shape:

```
Plan:        ./product/plans/draft/<file>
Complexity:  N/10 — <rationale>
Trimmed:     <short bullets — each rung-1 removal, each rung 2-5 reuse pointer added, each rung-6 simplification>
Open:        <anything only the human can decide, e.g. scope doubts, or a cut you flagged instead of made — or "nothing">
```

Keep it brief. Done.
