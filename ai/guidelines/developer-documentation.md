# Writing Developer Documentation

Guidance for docs aimed at contributors, not end users: `product/specs/`, `product/plans/`, `ai/guidelines/`
itself, and the developer-facing parts of `README.md`. The audience already knows how to run the
app and wants to know how it's built and why — the opposite orientation from
[[user-documentation]], which assumes no codebase knowledge at all. For sentence-level tone, see
[[human-writing-guidelines]].

## Specs describe behavior precisely, not just architecture

Every file in `product/specs/` is a **behavior spec**, not a design essay: it should let a contributor
predict exactly what the app does for a given input, including edge cases and error messages,
without reading the implementation. The existing specs in this repo already establish the house
style — match it rather than inventing a new one:

- **Cross-reference with `[[name]]`** where `name` matches another spec's filename (minus `.md`),
  so related behavior links up without duplicating explanation. A `[[link]]` to a spec that doesn't
  exist yet is fine — it marks something worth writing, not an error.
- **Name the implementation** where it disambiguates behavior: the function, file, or module that
  owns a piece of logic (`ScheduleManager` in `src/schedule-manager.ts`, `flattenBuffer` in
  `src/tab.ts`). This is the opposite rule from user documentation, which must never do this — a
  spec's reader is the person who will go read that file next.
- **State the exact error and usage messages**, verbatim, not paraphrased — a contributor
  implementing a caller needs the literal string, and a paraphrase invites drift between the spec
  and the code.
- **Cover edge cases as a first-class section**, not a footnote: what happens on a duplicate name,
  an empty result, a missing target, a malformed invocation. These are exactly the cases a reader
  can't infer from the happy path alone.
- **Explain the "why" inline, briefly, at the point of the surprising decision** — not as a
  separate essay. A one-sentence rationale next to the rule it justifies (why secrets are denied
  last in the sandbox profile, why `TMPDIR` is overridden) is worth more than a wall of prose
  elsewhere that the reader has to go find.

## README: minimize time-to-first-success

The README is the first developer-facing doc a contributor reads, and its job is narrower than
it looks: get someone from "I found this repo" to "I ran it / made my first change" as fast as
possible — not to hold the whole architecture.

- The first couple of lines should answer what the project is and why someone would want it;
  everything else is secondary to that.
- Lead with the smallest working example — the actual install/run commands, verbatim — before
  architecture or design discussion. A contributor's first goal is a working local setup, the same
  "time-to-first-call" instinct API docs optimize for.
- Push deep detail (architecture rationale, full command reference) out to `product/specs/` and link to it,
  rather than growing the README past what a newcomer needs on day one. A README bloated with
  reference material makes the one thing it must do — get someone running — harder to find.
- Keep it current the same way as any other doc here: a setup-affecting change updates the README
  in the same PR.

## Onboarding: answer "where do I look first?"

A new contributor's first real question is where things live and how to find them — not what
every subsystem does. The onboarding-relevant docs in this repo (`README.md`, `CLAUDE.md`,
`ai/guidelines/`) should collectively make that answerable within the first sitting:

- State explicitly where behavior is documented (`product/specs/`), where forward-looking design lives
  (`product/plans/`), and where conventions live (`ai/guidelines/`) — a newcomer shouldn't have to guess
  which directory is authoritative for which kind of question.
- Prefer a single, current source of truth over scattered partial explanations; treat contradicting
  or duplicated guidance across files as a bug to fix, not a style choice.
- Recently onboarded contributors (or a fresh session with no prior context) are the best source
  of gaps — treat a "how do I even find X" moment as a signal to fix the docs, not just answer the
  question once and move on.

## Technical specs and plans

`product/plans/` holds forward-looking design docs for work not yet done (or being done), organized by
status (`draft/`, `ready/`, `complete/`, `deferred/` — see the root `CLAUDE.md`). Unlike `product/specs/`,
which documents current behavior, a plan documents an intended change:

- Keep a plan only as detailed as needed to make the implementation decision — API/interface
  shape and the reasoning behind a choice, not a line-by-line restatement of every ticket.
- Cover the rejected alternatives briefly when the choice among them isn't obvious — this is what
  saves a future reader from re-litigating a decision that was already made deliberately.
- Move the plan file between status folders as its state changes, rather than leaving it in
  `draft/` after the work ships — a stale plan sitting in the wrong folder misleads the next
  person who searches there for what's actually in flight.
- Use natural line breaks, not fixed-column wrapping, per the existing `CLAUDE.md` convention.

## Record decisions, not just outcomes

When a non-obvious architectural or design choice is made — and especially when an alternative was
seriously considered and rejected — capture the *context, options considered, and consequences*,
not just the final shape. This is the ADR (architecture decision record) pattern: it exists so a
future contributor doesn't waste time re-deriving a rationale that already exists, or re-opening a
question that was already closed for a reason. In this repo that reasoning belongs inline in the
relevant spec or plan (see "Explain the 'why' inline" above) rather than in a separate decision
log, unless a decision spans many specs and genuinely needs its own page.

## Comments explain why; specs explain what and when

A code comment and a spec entry serve different jobs, and neither substitutes for the other:

- A **comment** belongs at the one line where the reasoning isn't recoverable from reading the
  code itself — a workaround for a specific bug, a non-obvious constraint, why the "obvious"
  simpler version doesn't work. This repo's own `CLAUDE.md` rule ("default to no comments; only
  when the WHY is non-obvious") is this principle applied directly — don't restate what the code
  already says clearly.
- A **spec entry** belongs where a contributor needs to know the behavior *without* reading the
  code at all — the full shape of a command, its edge cases, its error messages (see "Specs
  describe behavior precisely" above). A spec is discoverable and structured; a comment is local
  and easy to miss if you're not already reading that function.
- Write both at the same time as the change, not after — the reasoning behind a decision is
  cheapest to capture the moment it's made and gets fuzzier (or is skipped entirely) the longer
  it's deferred.
- An inaccurate comment or spec is worse than none: it actively misleads the next reader instead of
  leaving them to check the code. Treat correctness here as non-negotiable, not a nice-to-have.

## Keep developer docs versioned and reviewed like code

- `product/specs/`, `product/plans/`, and `ai/guidelines/` all live in the same repo and are reviewed the same way
  code is — a spec change should be part of the PR that changes the behavior it describes, not a
  follow-up.
- Prefer several small, focused files over one large one — the same file-size and
  single-responsibility reasoning as [[code-guidelines]] applies to docs.
- A stale spec is actively worse than no spec: it tells a contributor to implement or trust
  behavior that no longer exists. Treat "the spec still matches the code" as part of the definition
  of done for any behavior-changing PR — a reviewer should check this the same way they check that
  tests were updated, not treat it as optional polish.
- Docs staying next to the code they describe (`product/specs/` alongside `src/`, not in a separate wiki or
  external tool) is what makes this checkable at review time at all — a reviewer can't be expected
  to cross-reference a system outside the PR diff. If a doc genuinely can't live in-repo, at least
  link to it from the PR description so review can catch drift.
