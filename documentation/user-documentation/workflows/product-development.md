# Product development workflow

<img class="agent-float" src="/agents/malik-south.png" alt="" />

For creative work that runs over many sessions — building a product, writing a book, producing a series — a single prompt doesn't hold the whole project. You need somewhere to keep the list of things to do, a place to think through one of them before starting, and a record of what's actually true once it's done. This page describes a convention for that, built out of three plain-text pieces:

- a **backlog** — short lists of work, grouped by status
- **plans** — one file per unit of work, thought through before you start
- **specs** — one file per part of the finished product, kept up to date as the reference for what it currently is

None of this needs special support from janissary beyond files and folders. What makes it a *workflow* rather than just note-taking is that you drive it with [task files](/user-documentation/command-bar/tasks) opened through the [task picker](/user-documentation/command-bar/tasks) — each stage of the loop (draft a plan, harden it, execute it) becomes a task an agent can run on its own.

## The backlog

Keep a small set of markdown lists — one per category of work (say, `features.md`, `fixes.md`, `chores.md`) — each with three headings:

```markdown
# features

## ready

* a short line describing the next thing worth doing

## in progress

## deferred
```

An entry is a line or two, not a spec — just enough to recognize the idea later. `ready` is the queue; `in progress` holds anything a plan already exists for; `deferred` is things you're intentionally not doing yet. Moving an entry between headings *is* the status update — there's nothing else to synchronize.

## Plans

A plan is one file describing a single unit of work before any of it is built: what it does, the decisions already made about it, what's explicitly out of scope, and how you'll know it's done. Keep plans in one folder per status, moving the file itself as it progresses:

```
plans/
  draft/       being thought through, not yet reliable enough to build from
  ready/       reviewed, decided, safe to hand to an agent
  complete/    already built
  deferred/    intentionally on hold
```

A plan that's still in `draft/` might have open questions or unresolved wording; a plan in `ready/` shouldn't. That distinction matters because an agent picking up work should only ever pull from `ready/` — a draft is a conversation still in progress, not an instruction.

## Kept synced with GitHub by default

The backlog and plans folders are exactly the kind of files [git-syncing](/user-documentation/tab-types/editor-git-sync) exists for: a shared, living record that's meant to be hand-edited and always reflect what's actually true on GitHub, not a local draft you have to remember to push. That's why a fresh project's `syncPaths` configuration already covers both out of the box — `product/backlog/` and `product/plans/`, or wherever this workflow's files live in your project — so saving a backlog or plan straight from an [editor tab](/user-documentation/tab-types/editor) commits and pushes it for you.

That matters most for a loop like this one, where a plan moves between `draft/`, `ready/`, and `complete/` folders as work progresses: each move is a save, and each save is a commit that lands on GitHub immediately, so anyone (or any agent) looking at the repo sees the current status without needing you to run `git add`/`commit`/`push` by hand first. See [Git-synced files](/user-documentation/tab-types/editor-git-sync) for how to add more paths, or [the app's configuration](/user-documentation/getting-started/startup#configuration) for `syncPaths` itself.

## Specs

A spec is different from a plan, and you don't write it yourself: a plan is what you decide before something is built; a spec is what an agent writes *after*, to record what the finished thing actually does. One file per feature or part of the product, generated or updated as the last step of executing a plan — never edited by hand ahead of time, and never a place to record decisions, rationale, or history. It exists purely to answer "how does this behave right now," so the next plan (or the next agent) has an accurate description of the current system to build on instead of having to rediscover it.

Together, the two answer different questions, from different sources: "what are we building and why" is something you write into the plan before the work starts; "what does it do right now" is something an agent writes into the spec once the work is done.

## Driving the loop with task files

<img class="agent-float left" src="/agents/tahir-south.png" alt="" />

Each stage above is small enough to hand to an agent as a self-contained instruction file under `ai/tasks/`, opened without typing its path by hand through the [task picker](/user-documentation/command-bar/tasks) (`Ctrl+A`). A typical loop is four task files, each doing one stage and handing off to the next by moving a file between folders:

1. **Plan the next item.** Take the first entry off a backlog's `ready` list, ask you the handful of questions needed to pin down scope and behavior, and write the answers up as a new file in `plans/draft/`.
2. **Harden the plan.** Re-check a draft plan's claims against the current state of the project, resolve anything ambiguous, and move it to `plans/ready/` once nothing is left unresolved.
3. **Build it.** Pick the simplest plan out of `plans/ready/`, carry out its steps, update the matching spec, and move the plan to `plans/complete/`.
4. **Fix a small thing.** For work too small to need a drafted-then-hardened plan, take the next entry from a `fixes`-style backlog, resolve it directly, and record what changed in the spec.

Because each stage only reads and writes plain markdown files, none of this is specific to writing code — the same three-piece structure (backlog, plans, specs) works for any project made of discrete, plannable pieces: chapters, episodes, research questions, design assets. What changes between projects is the last step of "build it" — running tests versus proofreading a draft versus rendering an asset — not the shape of the loop around it.

## Why bother with the split

Three separate places to write things down feels like overhead until a project runs long enough that you'd otherwise lose track of where an idea stands. The backlog answers "what's next"; a plan answers "what did we decide about this one thing"; a spec answers "what's actually true right now." Collapsing them into one file or one running conversation works for a single session — it stops working once the project outlives your memory of it, which is exactly when this structure starts paying for itself.
