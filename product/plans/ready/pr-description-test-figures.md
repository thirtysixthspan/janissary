# Correct the pull request description's test-coverage figures

**Complexity: 1/10** — one paragraph of the pull request body. No source, test, or spec change, and
the figures it replaces are wrong in the code's favour rather than the description's.

The description's "How to verify" section cites a per-file case count for each of the three new test
blocks, alongside a whole-suite total. The per-file counts were wrong when written and have since been
made wrong again by the repairs that landed on this branch: three new cases were added while draining
the review backlog, so the dwell file went from ten to eleven, the escalation file from eleven to
twelve, and the busy-status block from seven to eight. The whole-suite total moved with them, from
10946 to 10956.

A count per file is the wrong shape for a number a reviewer is invited to check, because it goes stale
every time a case is added — and this branch has now demonstrated that twice. The entry that raised
this asked for the neighbouring counts to be confirmed "while in the same sentence" and preferred
phrasing that a later case would not make stale again. With three separate counts all wrong, the
robust phrasing is the fix rather than a restatement of three new numbers that the next drain would
invalidate the same way.

## Approach

Rewrite that one passage to describe what is covered rather than how many cases each file happens to
contain, and state the suite totals once, since those are the figures a reviewer can re-derive from a
single command. Name the behaviors each block pins — the dwell's timing and replacement rules, the
escalation's arm/cancel/fire-time-discard rules, the remote path reaching the same arm site — because
those stay true as cases are added. Do not touch the rest of the body: it is the author's statement
of intent and the evidence the next reader needs.

## Implementation steps

1. **Pull request body, "How to verify" section** — replace the enumerated per-file case counts with a
   description of what each new block covers, and update the whole-suite total to 744 test files and
   10956 tests. Leave the manual steps, the behavior examples, and every other section exactly as
   written.

2. Confirm nothing else in the body cites a count that has moved. The "Files changed" section
   describes files and areas rather than case counts, so it should need no edit — verify rather than
   assume.

## Tests

None. This changes prose in a GitHub field, not the repository.

## Out of scope

- Any test file. The counts in the code are correct; only the description was wrong.
- The description's title, which must match the commit subject.
- Any other section of the body.

## Verification

`gh pr view 1500 --json body` and read the rewritten passage back. Re-derive the suite total with
`npm test` and confirm it matches the figure now in the body. Confirm the manual steps and the
behavior examples are byte-identical to what the author wrote — `git diff` cannot help here, since the
body lives on GitHub rather than in the repository, so the comparison is between the body before this
change and after it.
