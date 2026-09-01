# Find React Organization Debt

Your job: read the layout and contents of `web/src/` against [`react-code-organization.md`](../../guidelines/react-code-organization.md) and find places where the code violates it, then log each one as a new entry, in the structured format Step 5 defines, under the `## development` section of `product/backlog/technical-debt.md`. This task **researches and records** organization debt. It never moves a file, never renames one, never extracts a module, and never touches an import. Resolving what lands here belongs to [`resolve-technical-debt.md`](../resolve-technical-debt.md), and for the subset that is a pure single-file extraction, to [`improve-modularity.md`](../hygiene/improve-modularity.md).

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

- **A violation is only debt if it costs something.** A single small helper sitting in a shared location with one consumer is technically §2, and it is also nothing. The same helper carrying a feature-specific flag so two callers can share it is real — the guideline calls that out precisely because it spreads. Judge the cost before logging, and write that judgment into the entry's `Existing Debt` severity and its two risk paragraphs in Step 5: how much the violation costs the app today, and how much of that cost the proposed move actually removes.
- **Only log what someone can finish in one sitting.** "Restructure `web/src/` into feature directories" is a true observation and a useless backlog item. If a violation is that large, log the smallest real slice of it — one feature's files, one boundary — and let the rest be re-found later. Never write an entry that amounts to a redesign.
- **Some entries route to a playbook and most do not.** [`resolve-technical-debt.md`](../resolve-technical-debt.md) triggers a hygiene playbook **only** when the entry names one, and inferring a playbook from a description is forbidden there. Step 5 says exactly which findings earn the `improve-modularity.md` trigger sentence — closing their `Proposal` paragraph — and which must be written without one so they get hand-planned. Getting this wrong either strands work or hands a target past a playbook's own safeguards.

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

Read `product/backlog/technical-debt.md`. Entries appear in more than one shape, and all of them count: newer ones follow the structured format Step 5 defines, where the `*` bullet carries a one-sentence summary and labeled paragraphs beneath it carry the rest — an entry begins at its `*` bullet and runs through its `Proposal` paragraph — while older ones are a single free-form paragraph ending in a severity rating. Read whichever you find as written; you are not migrating the old ones.

Collect every existing entry from **every** section — `## ready`, `## development`, `## deferred`, and `## declined` — into one list, identifying each by its lead `*` bullet: the summary line of a structured entry, the whole bullet of an older paragraph one. This is your dedupe set.

If a finding is already logged anywhere in the file, even worded differently, skip it this run. `## declined` matters as much as the others: an item there was considered and rejected, and re-logging it wastes a reviewer's time twice. Also skip a finding whose files are named in an entry about something else, when resolving that entry would collide with your proposal.

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

Every entry is one `*` bullet carrying a one-sentence summary, followed by four labeled paragraphs — `Existing Debt`, `Existing Risk`, `Proposal Risk`, `Proposal`, in that order and no other. Nothing is indented and nothing is bolded: every part sits flush at the left margin with a plain-text label, and a blank line separates it from the part before. No IDs, no extra parts beyond these five, and no scores beyond the three the template names:

```
* <one sentence, glanceable>

Existing Debt: <one sentence, naming the guideline section and the evidence> Severity: <N>/10

Existing Risk: <N>/10 - <one sentence>

Proposal Risk: <N>/10 - <one sentence>

Proposal: <the detailed plan, with the files, the action, and the blast radius>
```

The `*` bullet is the entry's identity line — it is what a reader scans, and what other tasks quote when they list, defer, or resolve the item — so it has to stand on its own without the paragraphs beneath it. Those paragraphs belong to it: an entry begins at its `*` bullet and runs through its `Proposal` paragraph, and the next `*` bullet begins the next entry.

Separate one entry from the next with **two** blank lines, not one. A single blank line separates an entry's own parts, so the wider gap is what makes the boundary between entries visible when scanning a long section — without it, a `Proposal` paragraph and the `*` bullet that follows it read as one run of text.

### The five parts

- **The summary bullet.** One sentence summarizing the whole proposal, readable at a glance: what would be done and roughly how much of the app it reaches. It carries no label. Write it as a change, not as a complaint. Keep it free of paths — the scope belongs in words ("out of the tab-navigator components", "across the picker feature's hooks") and the file references belong in the `Proposal` paragraph.
- **Existing Debt.** One sentence naming the violation that exists today: cite the guideline section by number and name, e.g. "§3 (no cross-feature imports)", and state what you actually read that confirms it — the specific import, the specific logic in the component body, the specific missing teardown. Not the rule, the evidence. Then a **debt severity** score from the scale below, written as a trailing `Severity: <N>/10` after that sentence's full stop. Describe what *is*, not what should be done about it; the fix is the `Proposal` paragraph's job.
- **Existing Risk.** An **existing risk** score, then ` - `, then one sentence on what the violation risks if it is never resolved: the bug the missing seam invites, the change it will make dangerous later, the coupling every new file in the area will inherit.
- **Proposal Risk.** A **proposed risk** score, then ` - `, then one sentence on the risk the code still carries once the move has landed. Both risk paragraphs come before the plan they judge, so write each to stand on its own for a reader who has not reached the `Proposal` paragraph yet — name the hazard rather than pointing back at a step they have not read.
- **Proposal.** The detailed plan, and the only long part. Write it for the audience that will actually use it: an AI agent that has not read the code, opening this entry cold and expected to execute the work successfully from what it says. Name the exact files, directories, components, hooks, and imports involved, each by path; say what changes in each one and what the resulting shape should be, concretely enough that whoever picks it up does not re-survey the tree. Give the blast radius — roughly how many files import the code and would be affected — and name the existing tests that pin the behavior which must not move. Reference files by path only, never by line number: the files move, the facts don't. Per Background, scope it as a single unit of work an agent could finish and verify in one sitting. When the finding routes to a playbook, the trigger sentence below is this paragraph's **final** sentence. Multiple sentences are expected; keep it to one paragraph.

"Low risk" is not a risk. If you genuinely see none in either risk paragraph, say what would make it visible if you were wrong.

### The scales

Both scales run 1–10. Score the **debt severity** by how much the violation is costing the app now:

| Debt severity | Meaning |
|---------------|---------|
| **1–3** | A single stray file, a barrel with few consumers, a `use*` prefix on a function that calls no hook. Nothing spreads and nearby work is unaffected. |
| **4–7** | A real violation contained to one area: a component holding testable rules, a hook doing two jobs, a shared module carrying feature-specific knowledge, a feature scattered across a couple of locations. Every change through the area pays for the missing seam. |
| **8–10** | A §3 cross-feature import or §8 layer inversion on an actively changing path, or a §7 service that cannot be substituted in tests. The coupling is spreading — each new file in the area inherits it. |

Score both **risk** values on one scale — likelihood times blast radius, judged against the code as it stands (`Existing Risk`) and as it would stand after the work (`Proposal Risk`):

| Risk | Meaning |
|------|---------|
| **1–3** | Unlikely to bite, or bites harmlessly: a cosmetic glitch, an edge case behind a rarely-taken branch, something a test would catch first. |
| **4–7** | Plausible failure in normal use with real user-visible consequences — a broken interaction, a stale view, data that has to be re-entered — but recoverable and contained to one area. |
| **8–10** | Likely, or catastrophic when it happens: data loss, silent corruption, a security or sandbox weakness, or a failure that takes out a core path for every user. |

**The two risk scores are the case for the work.** `Proposal Risk` should come in materially below `Existing Risk`; if it does not, the proposal is not buying enough to be worth logging — either sharpen it or drop the candidate. Never close the gap by scoring optimistically: if the move relocates the coupling rather than removing it, say so in the `Proposal Risk` sentence and let the two numbers sit close together.

### Routing — which entries name a playbook

Only one class of finding routes to a hygiene playbook. Apply this test exactly:

**Attach the trigger sentence** when the fix is a pure extraction out of **one** existing source file into one or more new module files, with every existing import still working — typically a §5 component holding logic that should move into a hook or pure module, or a §6 hook holding pure computation. In that case, and only that case, close the entry's `Proposal` paragraph with this sentence, verbatim in this form:

```
Resolve by running the `ai/tasks/hygiene/improve-modularity.md` task against `<path>`.
```

Before attaching it, confirm the target clears that playbook's own blockers — otherwise the routed run will stop without doing anything:

- The fix must not change the file's public API in a way that breaks other files' imports.
- It must not require editing more than one existing source file, or changing import paths in more than three.
- It must not require editing a test file.
- The file must not be security, password/crypto, shell-execution, PTY/terminal, or network code. A WebSocket or protocol client is network code and is blocked — write that finding without the trigger sentence.

**Write no trigger sentence** for everything else — §1 scatter, §2 misplaced shared code, §3 cross-feature imports, §4 barrels, §7 service coupling, §8 layer inversions. These are multi-file moves or design changes, which `improve-modularity.md` explicitly refuses. They get hand-planned by `resolve-technical-debt.md`, which is the correct path. Do not invent a playbook reference to make an entry look actionable, and do not name a playbook that does not exist.

### Worked examples

A routed entry, because the fix is a single-file extraction:

```
* Move the sorting and grouping rules out of the widget list component into a pure module beside it, so the ordering can be tested and shared instead of re-derived.

Existing Debt: The widget list computes its display order inline across roughly forty lines of the component body, mixing the ordering rules with the JSX in violation of §5 (components render, they do not decide), and the widget panel has reimplemented a near-identical ordering because there was nothing to import. Severity: 5/10

Existing Risk: 4/10 - Neither ordering can be exercised without rendering the component that holds it, so a rule corrected in one surface keeps producing the old order in the other and no test can tell.

Proposal Risk: 2/10 - The rules become plain functions anyone can call directly, but the extraction is behavior-preserving by eye only: nothing pins the current comparator, so a transcription slip would land unnoticed until someone looked at the rendered order.

Proposal: `web/src/widget/WidgetList.tsx` builds its display order in the component body. Extract those rules into a new `web/src/widget/order.ts` as plain functions that take the widget array and return the ordered array, and have the component call them in place of the inline block. Scope the change to that one file: `web/src/widget/WidgetPanel.tsx` holds a near-duplicate of the same ordering, but switching it over is a second edit that would push this past what the playbook accepts, so leave it for a follow-up entry once the shared module exists. `WidgetList.tsx`'s props do not change, so the three files that import it are unaffected and no import path moves. `web/src/widget/WidgetList.test.tsx` renders the list and asserts on the rendered row order — it needs no edit and must keep passing. Resolve by running the `ai/tasks/hygiene/improve-modularity.md` task against `web/src/widget/WidgetList.tsx`.
```

And a hand-planned one, because it is a multi-file move:

```
* Break the widget feature's reach into the gadget feature by lifting the active-id lookup both need into a shared module the app shell owns.

Existing Debt: The widget sync hook imports the active gadget id straight out of the gadget feature's state module, violating §3 (no feature imports another feature), so neither feature can be tested, moved, or deleted without the other. Severity: 7/10

Existing Risk: 6/10 - A cycle appears the moment the gadget feature needs anything back from widget, and every file added near the seam inherits the coupling, so what is a two-file untangling today becomes a multi-feature one later.

Proposal Risk: 3/10 - The features stop importing each other, but the lookup becomes a third place holding active-id knowledge and nothing stops a later contributor from putting feature-specific branching in it.

Proposal: `web/src/widget/useWidgetSync.ts` imports the active gadget id from `web/src/gadget/gadget-state.ts`. The shared piece is the lookup itself: move it into a new `web/src/shared/active-gadget.ts` that neither feature owns and have both import it from there, or pass the id down as a prop from `web/src/App.tsx`, which already composes both features and may read it directly under §3. Two files import `useWidgetSync.ts` and one imports `gadget-state.ts`, so the change is contained to four files. `web/src/widget/useWidgetSync.test.ts` stubs the gadget state module by path and needs its stub retargeted at the new module — that test edit, and the second source file, are why this cannot be routed to `improve-modularity.md`.
```

---

## Step 6 — Integrate into the `## development` section

Open `product/backlog/technical-debt.md` and add your new entries to the end of the `## development` section only. Leave `## ready`, `## deferred`, and `## declined` exactly as they are — do not reorder, reword, reformat, or remove anything in any section, including `## development`'s existing entries. Older paragraph-form entries stay exactly as written; the new format applies to what you add, not to what is already there.

Before moving on, verify:

1. `git status` shows `product/backlog/technical-debt.md` as the **only** changed file. No file under `web/src/` or `src/` may appear. If one does, you refactored something, which this task never does — revert it.
2. `git diff` shows the only changes are new lines appended inside `## development` — nothing removed, nothing changed elsewhere in the file.
3. Every new entry carries all five parts, in order — the `*` summary bullet, then `Existing Debt`, `Existing Risk`, `Proposal Risk`, and `Proposal` — each unindented, each separated by a blank line, with all three scores present.
   Two blank lines separate each entry's `Proposal` paragraph from the next entry's `*` bullet, so each entry reads as one block running from its bullet to its plan and the boundary between blocks is wider than the gaps inside them.
4. Every new entry names its files in the `Proposal` paragraph and cites a guideline section by number in `Existing Debt`.
5. Every entry carrying the trigger sentence ends its `Proposal` paragraph with it, names exactly one file, in the exact form given in Step 5, and clears all four `improve-modularity.md` blockers. Every other entry carries no playbook reference at all.
6. None of the new entries duplicate an item from Step 1's dedupe set.

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
Entries:             <one line per new entry: its summary bullet, guideline section, debt severity, existing → proposal risk, routed or hand-planned — or "none found">
Commit:              <short-sha> pushed to master | push failed (see above)
```

Keep it brief. Done.
