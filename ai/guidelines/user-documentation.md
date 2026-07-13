# Writing User Documentation

Guidance for writing user-facing docs (`documentation/user-documentation/`) from the internal specs
(`specs/`). Specs describe implementation and behavior for contributors; user documentation
describes tasks and concepts for someone running the app who has never read the spec and never
will. Don't just reformat a spec into a doc page — rewrite it for the reader's goal, and drop
every internal detail that doesn't serve that goal (see "No implementation leakage" below). For
sentence-level tone, see [[human-writing-guidelines]]; this document is about structure and
content, not prose style. For docs aimed at contributors instead of end users, see
[[developer-documentation]].

## Organize by the Diátaxis framework

Every doc page has exactly one job. Diátaxis (https://diataxis.fr) splits that job along two axes
— action vs. cognition, and learning vs. working — into four types. Decide which one a page is
*before* writing it, and don't mix jobs on one page:

| Type | Answers | Reader is | Example for this app |
|---|---|---|---|
| **Tutorial** | "Teach me, step by step" | Learning, needs hand-holding | "Your first session with `janus`" |
| **How-to guide** | "How do I do X?" | Already competent, has a goal | "How to run a workspaced agent" |
| **Reference** | "What are the exact facts?" | Looking something up mid-task | Command syntax tables (flags, subcommands, defaults) |
| **Explanation** | "Why does it work this way?" | Building a mental model | "How tab grouping works" |

A single spec file often contains material for two or three of these — split it rather than
publishing the spec verbatim. `scheduling.md`, for example, has reference material (the form
table, the `schedule` command grammar) and explanation material (why entries are tab-scoped, how
firing interacts with the scheduler tick); those belong on different pages, or at least under
different headings a reader can skip between.

## Lead with the goal, not the mechanism

Put the most useful sentence first — what the reader can now do — not the background or the
implementation detail that makes it possible. If someone searches "open a web page in a tab," the
first line should be `open <url>` opens it, not a paragraph about the opener registry pattern.
Move architecture and "why" content into an Explanation page or a clearly marked aside; don't make
the reader wade through it to find the command.

## Examples before exposition

For a CLI/TUI app, readers reach for examples before prose. Every how-to and reference page should
show a runnable command near the top — ideally the most common invocation — before explaining
flags or edge cases. Build from simple to complex within a page: the bare command first, then one
variant, then the edge cases and error messages last. Full flag-by-flag breakdowns belong in the
reference table, not the lede.

## Minimalism: support the task, don't teach everything

Carroll's minimalist-instruction research (the basis for most modern task-based writing) found
that shorter, action-first documentation beats comprehensive manuals on learning time, confidence,
and error recovery — not despite leaving things out, but because of it. Apply it directly:

- Let the reader start on a real task immediately; don't preface a how-to with paragraphs of setup
  or background they didn't ask for.
- Cut passive reading wherever an example or a short exercise can substitute for it. A worked
  command the reader can run teaches faster than a paragraph describing what the command does.
- Document error recovery, not just the happy path — what a mistake looks like and how to get back
  on track is exactly the content a minimal-but-complete page needs (this repo's specs already list
  verbatim error/usage messages for this reason; carry the messages, not the mechanism, into the
  user doc — see "No implementation leakage" below).
- Make each page self-contained. A reader landing on a how-to guide from search shouldn't need to
  have read three other pages first to follow it; link to prerequisites rather than assuming them.

## Progressive disclosure

Give the reader just enough to complete the task in front of them, and defer the rest behind a
link or a lower heading rather than inlining it:

- An overview or how-to page states the common case first, then links out to reference detail
  (the full flag table) and edge cases rather than front-loading all of it.
- Limit disclosure to one layer deep per page. A reader who has to click through several nested
  "see more" links to find the one flag they need has a worse experience than one long reference
  page with clear headings — progressive disclosure organizes what's *primary* vs. *secondary*, it
  doesn't hide information behind a maze.
- This is the same instinct as Diátaxis's separation of how-to from reference: the how-to page
  shows the one command that solves the reader's problem; the reference page is where every flag,
  default, and variant lives for the reader who already knows they need it.

## No implementation leakage

User documentation is written for a reader who has never seen the codebase and never needs to.
Strip everything that only makes sense to a contributor:

- No file paths, function names, module names, or internal class names (`src/tab.ts`,
  `flattenBuffer`, `TabManager.markUnread` — these belong in `specs/`, never in
  `documentation/user-documentation/`).
- No "why we implemented it this way" engineering trade-off discussion — that's explanation for
  contributors, not users. A user-facing Explanation page answers "why does the app behave this
  way from where I'm sitting," not "why did we choose this data structure."
- Command names, flags, error messages, and observable behavior are the only things that survive
  the rewrite from spec to user doc.

## Conventions specific to this app's docs

- **Monospace for anything typed or displayed**: commands, flags, file paths, tab labels, key
  chords (`Ctrl+R`, not "control R").
- **Consistent command-syntax notation**: `<angle brackets>` for a required argument the reader
  supplies, `[square brackets]` for optional, `a|b` for mutually exclusive choices — matching how
  the specs already write usage lines (e.g. `open [external] [page] <target>`).
- **Name the actual error/usage message** a reader will see, verbatim, rather than paraphrasing
  it — that's what they'll search for.
- **Cross-link, don't duplicate.** When a concept is fully explained elsewhere (e.g. Tab grouping),
  link to that page instead of re-explaining it inline.

## Style rules (borrowed from the Google developer style guide)

- Second person ("you"), active voice, present tense.
- Put UI/tab elements in **bold**, code and commands in `code font`.
- Sentence case for headings.
- Put conditions before instructions ("If the workspace doesn't exist, ..." not the reverse).

## Plain language and accessibility

Plain language is an accessibility feature, not just a style preference — WCAG's guidance on
reading level, unusual words, and abbreviations exists because unnecessarily complex writing
excludes readers with cognitive disabilities, non-native speakers, and anyone skimming under time
pressure. Concretely:

- Short sentences, one idea per sentence. Prefer the common word over the fancier synonym.
- Define or avoid jargon and abbreviations on first use — including this app's own vocabulary
  (`ACP`, `harness`, `workspaced agent`) the first time a page mentions it.
- Use descriptive, specific headings (`Close a page tab`, not `Closing`) — headings are how both
  sighted skimmers and screen-reader users navigate a page, and vague ones fail both.
- Every screenshot or diagram needs alt text that conveys the same information the image does, not
  just a filename or "screenshot of the app."

## Visuals: use them with intent

A screenshot or short screen recording earns its place when it shows something genuinely visual
(a layout, a zoom/pan interaction, a dialog's button arrangement) — not as decoration and not as a
substitute for an instruction a sentence could give faster ("click **Save** in the top-right" beats
a screenshot of an ordinary button).

- Prefer a short, silent, loopable clip over a screenshot when the point is a *motion* or sequence
  (e.g. zooming an image tab, dragging to pan) — a still can't show that.
- Skip visuals for generic, expected UI (a standard confirmation dialog, a plain text input) — they
  add maintenance cost without adding information.
- Place a visual immediately after the text it illustrates, give it a caption, and keep it minimal
  — crop to the relevant area rather than showing the whole app window.
- Never use a screenshot in place of a code sample or command — those must stay as selectable,
  copyable text.
- A visual is one more thing that goes stale when the UI changes; budget for updating it under the
  same "docs as code, same PR" rule as the surrounding text (see below).

## Validate it against real readers

Before treating a page as done, run the two cheap checks that catch most usability problems:

- **Task-based check**: hand the page to someone who fits the target audience and watch whether
  they can complete the task using only the page, without narrating or helping them.
- **Paraphrase check**: ask them to explain a section back in their own words — a garbled paraphrase
  means the writing, not the reader, needs work.

Findability matters as much as the writing itself: a correct page nobody can locate might as well
not exist. Give every page a heading and title that matches the phrase a reader would actually
search for (task-first, not implementation-first — "close a page tab," not "page tab teardown"),
and make sure the site's navigation and search surface it from the terms a newcomer would use, not
just the internal name for the feature.

## Treat docs as code

User docs live in version control (`documentation/user-documentation/`) next to the code they describe, same
as everything else in this repo:

- A behavior change that lands in a PR should update the doc page in the same PR when the change
  is user-visible — don't let docs drift from behavior. Stale docs that describe removed or changed
  behavior are worse than no docs, since they actively mislead.
- Prefer many small, focused pages over one large page per feature area — mirrors the file-size and
  single-responsibility guidance in [[code-guidelines]].
- Review doc changes the same way code changes are reviewed; a doc PR should be readable as a diff.

## Deciding what to document, and when

Not every spec needs a public page, and not all at once. Tier by audience reach: onboarding-critical
content first, everyday features next, advanced/specialized features after that, and pure
implementation detail (the kind aimed at contributors, not users) left out of
`documentation/user-documentation/` entirely — that belongs in `specs/`, per [[developer-documentation]].
