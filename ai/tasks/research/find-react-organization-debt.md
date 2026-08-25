# Find React Organization Debt

Your job: read the layout and contents of `web/src/` against [`react-code-organization.md`](../../guidelines/react-code-organization.md) and find places where the code violates it, then log each one as a new entry under the `## development` section of `product/backlog/technical-debt.md`. This task **researches and records** organization debt. It never moves a file, never renames one, never extracts a module, and never touches an import. Resolving what lands here belongs to [`resolve-technical-debt.md`](../resolve-technical-debt.md), and for the subset that is a pure single-file extraction, to [`improve-modularity.md`](../hygiene/improve-modularity.md).

The guideline is the spec for this task. It defines feature-based organization over type-named buckets, colocation with promotion to shared only on the second consumer, one-way `shared → feature → app` dependency flow with no cross-feature imports, no barrel files at feature boundaries, components that render rather than decide, hooks as the reactive seam, framework-free injected services, and the pure module → service → hook → component layering. **Read it in full before Step 2.** Every entry you write must trace to one of its numbered sections, and you cite that section by number in the entry.

**Never run repository tools.** Do not run `npm run lint`, `npm run typecheck`, `npm run test`, `npm run quality`, `./scripts/run.mjs check-diff`, FTA, or any other build/lint/test/analysis machinery. Organization debt is visible by reading files and import statements, so reading is all you need. Plain read-only shell commands used to navigate (`ls`, `find`, `grep`, `wc -l`, `git log`) are fine.

This task edits **one file only**: `product/backlog/technical-debt.md`, and only its `## development` section. You will never touch application source code, tests, specs, documentation, or config, and you will never modify the `## ready`, `## deferred`, or `## declined` sections.

**No AI attribution — anywhere.** Never credit an AI agent as an author or contributor. No `Co-Authored-By:` trailers naming Claude or any other AI, no "Generated with Claude Code" lines or badges, no AI authorship notes anywhere in the files you write. The commit's configured git author is the only authorship ever recorded.

Do the steps below **in order**. Do not skip steps. Do not invent your own process.

**Run autonomously.** Do not ask the user questions or wait for feedback at any step.

---

## Background — what makes an organization violation worth logging

The guideline's rules exist because each one, when broken, makes a specific future change harder. That "harder" is the debt, and it is what the entry has to make visible. An entry that says a file breaks §5 is a rule citation; an entry that says a component holds the sort-and-filter rules its sibling also needs, so neither can be tested without a render, is a reason to do the work.

Three things follow:

- **A violation is only debt if it costs something.** A single small helper sitting in a shared location with one consumer is technically §2, and it is also nothing. The same helper carrying a feature-specific flag so two callers can share it is real — the guideline calls that out precisely because it spreads. Judge the cost before logging.
- **Only log what someone can finish in one sitting.** "Restructure `web/src/` into feature directories" is a true observation and a useless backlog item. If a violation is that large, log the smallest real slice of it — one feature's files, one boundary — and let the rest be re-found later. Never write an entry that amounts to a redesign.
- **Some entries route to a playbook and most do not.** [`resolve-technical-debt.md`](../resolve-technical-debt.md) triggers a hygiene playbook **only** when the entry names one, and inferring a playbook from a description is forbidden there. Step 5 says exactly which findings earn the `improve-modularity.md` trigger sentence and which must be written without one so they get hand-planned. Getting this wrong either strands work or hands a target past a playbook's own safeguards.

Scope is `web/src/` only. The guideline governs the React app; `src/` is the Node server and is covered by [`architecture-principles.md`](../../guidelines/architecture-principles.md) and other research tasks. Do not log a `src/` finding here.

---

## Step 0 — Prepare the workspace

This task only reads files and runs git — it never builds, tests, lints, or runs the app — so it does not need the full [`prepare-workspace.md`](../workspace/prepare-workspace.md) install. Do this instead:

1. `git checkout master` and `git pull origin master`.
2. Skip `npm install` entirely.
3. Confirm a clean starting point with `git status`.

The working tree **must be clean** — no modified *and no untracked* files. This matters more than usual here: the quick-commit step at the end stages everything with `git add -A`, so any stray file would be silently swept into this task's commit. If the tree is not clean, STOP and report what is there — do not start on top of changes you did not make.

**Command hygiene for the whole run:** run each command plainly and read its output from the result — no piping into `tail`/`head`, no `>` redirects, no `$(...)` capture. These trigger permission prompts or hook rejections in this repo (see CLAUDE.md) and cost a wasted call each time.

---

## Step 1 — Load the existing backlog

Read `product/backlog/technical-debt.md`. Collect every existing bullet from **every** section — `## ready`, `## development`, `## deferred`, and `## declined` — into one list. This is your dedupe set.

If a finding is already logged anywhere in the file, even worded differently, skip it this run. `## declined` matters as much as the others: an item there was considered and rejected, and re-logging it wastes a reviewer's time twice. Also skip a finding whose files are named in a bullet about something else, when resolving that bullet would collide with your proposal.

---

## Step 2 — Survey the tree and read the code

Start with the shape of the directory, then read into it:

```bash
find web/src -type d | sort
ls web/src
find web/src -name "*.tsx" -not -name "*.test.tsx" | wc -l
find web/src -name "*.ts" -not -name "*.test.ts" | wc -l
```

Then work the taxonomy below. Each row names a guideline section, what the violation looks like, and a command that surfaces candidates. The commands find *suspects*, not findings — every suspect must be confirmed by reading the file before it becomes a candidate.

**Placement and boundaries**

- **§1 — feature scattered across type buckets or a flat root.** One product capability whose components, hooks, and helpers sit in separate type-named directories, or in a large flat directory, rather than in a directory named for the feature. Look for a shared naming prefix across files in different places — that prefix is the author grouping by hand because the tree does not.
  ```bash
  ls web/src/*.ts web/src/*.tsx
  ```
- **§2 — shared code with one consumer, or shared code that knows a feature.** A module in a shared location imported by exactly one file, or a shared module containing a branch, flag, or type that only one feature could want.
  ```bash
  grep -rln "<module-name>" web/src --include=*.ts --include=*.tsx
  ```
  One hit besides the module itself and its test means one consumer.
- **§3 — cross-feature import.** A file inside one feature directory importing from a sibling feature directory. This is the guideline's load-bearing rule and the highest-value thing this task finds.
  ```bash
  grep -rn "from '\.\./" web/src --include=*.ts --include=*.tsx
  ```
  Read each hit: an import that climbs out of its own feature directory and back down into another one is the violation. An import into a shared location, or an app-shell file importing a feature, is correct and is not a finding.
- **§4 — barrel file.** An `index.ts`/`index.tsx` whose body is re-exports.
  ```bash
  find web/src -name "index.ts" -o -name "index.tsx"
  ```
  Read each one. A real entry component named `index.tsx` is fine; a file of `export * from` / `export { X } from` lines is the violation.

**Layering**

- **§5 — component owning decisions.** Business rules, data shaping, sorting/filtering/matching algorithms, or protocol calls inside a component body or JSX. Also a presentational component taking a service instance or a whole application-state object as a prop instead of the values it renders.
  ```bash
  grep -rln "\.map(\|\.filter(\|\.sort(" web/src --include=*.tsx
  ```
  Trivial render-time mapping over a prop is not a finding. A rule you would want to unit test is.
- **§6 — hook misuse.** Four shapes: a `use*` function that calls no React hook (should be a plain function); a generic lifecycle wrapper (`useMount`, `useEffectOnce`, `useUpdateEffect`); a hook returning several unrelated groups of values (should be several hooks); pure computation trapped inside a hook so callers cannot invoke it conditionally or test it without rendering.
  ```bash
  grep -rln "export function use" web/src --include=*.ts --include=*.tsx
  ```
  Open the suspects and check what each actually calls.
- **§7 — service coupling.** A service module that imports React; a component that constructs a service itself; a module-level service singleton imported directly into components rather than injected via props or context; a service that acquires a socket, listener, timer, or observer without exposing matching teardown.
  ```bash
  grep -rn "^export const .* = new \|^const .* = new " web/src --include=*.ts
  grep -rn "addEventListener\|setInterval\|setTimeout" web/src --include=*.ts
  ```
  For the second command, confirm by reading whether each acquisition has a paired release.
- **§8 — layer inversion.** A component importing a service directly, past the hook that should own it. A service importing a hook or a component. Either direction breaks the one-way flow the layer table describes.

For every candidate, record the exact files, the guideline section it violates, and the specific thing you read that confirms it. You need all three to write a concrete entry in Step 5.

You do not need to cover `web/src/` exhaustively in one run. Favor areas that recent `git log` shows are churning — a violation in code nobody touches costs nobody anything, and the guideline's whole argument is about the cost of the *next* change.

---

## Step 3 — Filter out what should not be logged

Cross out any candidate that trips one of these:

1. **No cost.** The violation is technically true and changes nothing about how hard the code is to work with. A one-line helper, a single stray file in an otherwise quiet area, a component with one inline `.filter()` over its own props.
2. **Too large to be one work item.** The finding is really "reorganize the app." Replace it with the smallest coherent slice, or drop it.
3. **Not actually a violation.** An app-shell file importing features (§3 permits it), a genuinely generic primitive living in a shared location with one consumer *today* but no feature-specific knowledge (§2 permits it), a little duplication (§6 explicitly permits it), `main.tsx` and other framework-imposed entry points.
4. **Blocked by the guideline's own allowances.** §1 says a small feature stays a handful of flat files inside its directory; do not log missing interior structure as debt. §2 says promote on the *second* consumer; do not log a not-yet-shared module as debt.
5. **Already in the dedupe set** from Step 1.

What survives is your candidate list.

---

## Step 4 — Bound the run

Cap this run at **6 new entries**. These findings are larger than a namespace move and each one is a real refactor, so a backlog of six is already several sessions of work, and a longer list goes stale as the tree shifts underneath it.

If more than six candidates survive Step 3, keep the six with the strongest case, ranked in this order:

1. **§3 cross-feature imports** and **§8 layer inversions** — these compound, because every new file added near them inherits the coupling.
2. **§7 service coupling** — a service that cannot be swapped in a test blocks every test written against code above it.
3. **§5 components owning logic** in high-churn areas.
4. Everything else.

Do not pad the list to hit the cap. Finding zero candidates is a valid outcome — it means the app already follows the guideline, which is the point of the exercise. Do not invent a violation that is not there.

---

## Step 5 — Write each entry

Match the existing style in `product/backlog/technical-debt.md`: one `*` bullet, one paragraph, imperative and concrete, no IDs and no scores beyond the severity rating. Each bullet must:

- Name the exact file(s) involved.
- Cite the guideline section by number and name, e.g. "§3 (no cross-feature imports)".
- State what you actually read that confirms the violation — the specific import, the specific logic in the component, the specific missing teardown. Not the rule, the evidence.
- State the cost in one clause: what future change this makes harder or riskier.
- State the action that resolves it, concretely enough that whoever picks it up does not re-survey the tree.
- Note the blast radius: roughly how many files import the code and would be affected.
- Carry a severity rating.

### Routing — which entries name a playbook

Only one class of finding routes to a hygiene playbook. Apply this test exactly:

**Attach the trigger sentence** when the fix is a pure extraction out of **one** existing source file into one or more new module files, with every existing import still working — typically a §5 component holding logic that should move into a hook or pure module, or a §6 hook holding pure computation. In that case, and only that case, end the bullet with this sentence, verbatim in this form:

```
Resolve by running the `ai/tasks/hygiene/improve-modularity.md` task against `<path>`.
```

Before attaching it, confirm the target clears that playbook's own blockers — otherwise the routed run will stop without doing anything:

- The fix must not change the file's public API in a way that breaks other files' imports.
- It must not require editing more than one existing source file, or changing import paths in more than three.
- It must not require editing a test file.
- The file must not be security, password/crypto, shell-execution, PTY/terminal, or network code. A WebSocket or protocol client is network code and is blocked — write that finding without the trigger sentence.

**Write no trigger sentence** for everything else — §1 scatter, §2 misplaced shared code, §3 cross-feature imports, §4 barrels, §7 service coupling, §8 layer inversions. These are multi-file moves or design changes, which `improve-modularity.md` explicitly refuses. They get hand-planned by `resolve-technical-debt.md`, which is the correct path. Do not invent a playbook reference to make an entry look actionable, and do not name a playbook that does not exist.

### Severity

| Severity | Meaning |
|----------|---------|
| **high** | A §3 cross-feature import or §8 layer inversion on an actively changing path, or a §7 service that cannot be substituted in tests. The coupling is spreading — each new file in the area inherits it. |
| **medium** | A real violation contained to one area: a component holding testable rules, a hook doing two jobs, a shared module carrying feature-specific knowledge, a feature scattered across a couple of locations. |
| **low** | A single stray file, a barrel with few consumers, a `use*` prefix on a function that calls no hook. Worth doing, nothing is on fire. |

An entry in the right shape reads roughly like this:

```
* Move the sorting and grouping rules out of `web/src/widget/WidgetList.tsx` into a pure module beside it: the component body computes the display order inline across roughly forty lines, mixing the ordering rules with the JSX, which violates §5 (components render, they do not decide) — the rules cannot be unit tested without rendering, and `WidgetPanel.tsx` already reimplements a near-identical ordering because there was nothing to import. Extract them into `web/src/widget/order.ts` as plain functions and have both components call it; three files import `WidgetList.tsx` and none of them are affected, since its props do not change. Resolve by running the `ai/tasks/hygiene/improve-modularity.md` task against `web/src/widget/WidgetList.tsx`. Severity: **medium**.
```

And one without a playbook, because it is a multi-file move:

```
* Break the cross-feature import from `web/src/widget/useWidgetSync.ts` into `web/src/gadget/gadget-state.ts`: the widget feature reaches directly into the gadget feature's state module to read the active gadget id, violating §3 (no feature imports another feature), so neither feature can be tested, moved, or deleted independently and a cycle appears the moment gadget needs anything from widget. The shared piece is the active-id lookup itself — lift it into a shared module both features import, or pass the id down from the app shell that already composes both. Two files import `useWidgetSync.ts` and one imports `gadget-state.ts`, so the change is contained. Severity: **high**.
```

---

## Step 6 — Integrate into the `## development` section

Open `product/backlog/technical-debt.md` and add your new bullets to the end of the `## development` section only. Leave `## ready`, `## deferred`, and `## declined` exactly as they are — do not reorder, reword, or remove anything in any section, including `## development`'s existing entries.

Before moving on, verify:

1. `git status` shows `product/backlog/technical-debt.md` as the **only** changed file. No file under `web/src/` or `src/` may appear. If one does, you refactored something, which this task never does — revert it.
2. `git diff` shows the only changes are new lines appended inside `## development` — nothing removed, nothing changed elsewhere in the file.
3. Every new bullet names its files and cites a guideline section by number.
4. Every bullet carrying the trigger sentence names exactly one file, in the exact form given in Step 5, and clears all four `improve-modularity.md` blockers. Every other bullet carries no playbook reference at all.
5. None of the new bullets duplicate an item from Step 1's dedupe set.

If anything else changed on disk, revert it (`git checkout -- <file>`) before committing.

---

## Step 7 — Commit and push

Execute [`quick-commit.md`](../workspace/quick-commit.md) in full to commit the result on `master` and push it to the remote. Use a `chore` type subject, e.g.:

```
chore(backlog): log react organization debt
```

(The workspace was checked out on `master` in Step 0, so the quick-commit push lands the change directly on `master` remote — no separate merge step is needed.)

---

## Step 8 — Report

Give the user a short report in this exact shape:

```
Candidates seen:     <count from Step 2>
Filtered out:        <count> (<file or area>: <one-line reason>, …)
New entries added:   <count> (to product/backlog/technical-debt.md, ## development)
Entries:             <one line per new entry: file(s), guideline section, severity, routed or hand-planned — or "none found">
Commit:              <short-sha> pushed to master | push failed (see above)
```

Keep it brief. Done.
