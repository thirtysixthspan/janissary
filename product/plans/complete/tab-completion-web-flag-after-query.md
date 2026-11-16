# State the after-the-query condition in the tab-completion spec's web flag rule

**Complexity: 1/10** — no production lines or files, one spec sentence corrected and 2 requirements (p=2.35)

## Goal

`product/specs/tab-completion.md`'s `### Web command` section must say the `web search` flags complete only after the query: the dash must not be the first word after `web search`, so `web search -` leaves the line unchanged with no candidates. The rest of the section already matches the code and must stay as it is.

## Issue

Recorded on PR #2010's branch backlog, severity 2/10:

> Correct the tab-completion spec's web flag rule, which never states that the flags are offered only after the query.

The Candidates sentence in the `### Web command` section says:

> After `web search`, a word starting with `-` offers the flags not already used: `--results`, `--max-chars`, `--depth`, and `--provider`.

That sentence has no after-the-query condition. A reader takes it to promise candidates for `web search -`, but the implementation returns none there, and the spec never explains why.

Verified against the code:

- `src/completion/web.ts`'s `completeWebCommand` sends any line whose first word is `web` and whose second word is `search` to `completeSearchArgument`.
- `src/completion/web.ts`'s `completeSearchArgument` offers the unused `WEB_FLAGS` only when `cursor.token.startsWith('-') && cursor.argumentIndex >= 3`.
- `src/completion/cursor.ts`'s `readCompletionCursor` sets `argumentIndex` to the number of whitespace-separated words before the token, so `web search -` has two preceding words and takes the `unchanged` path, while `web search foo -` has three and reaches the flag list.
- `src/completion/web.test.ts`'s `offers the flags not yet used after the query` pins `web search node.js -` and `web search node.js --results 3 -`; `offers nothing before the query or for a query word that looks like a flag` pins `web search -` and `web search foo -site:x` as leaving the line unchanged with no matches.
- The code keys the flag branch on argument position, not on a parsed query, so an invalid line such as `web search --results 3 -` still offers flags. The corrected sentence must state the positional rule and not claim the completion parses a query.
- `documentation/user-documentation/command-bar/tab-completion.md`'s `After web` row already says "after the query, the flags not yet used", and `product/specs/web-search.md`'s Completion section already says "the flags not yet used after the query". Both word the rule correctly; only this section omits the condition.

## Approach

1. In `product/specs/tab-completion.md`, under `### Web command`, rewrite only the Candidates sentence about flags so it says the flags complete only after the query, with the dash not the first word after `web search`, and name `web search -` as leaving the line unchanged with no candidates.
2. Leave the rest of the section byte-for-byte: the first-argument `search` rule, the `--depth` and `--provider` value rules, the `--results` and `--max-chars` no-candidate rule in Behavior, the disabled-row behavior, and the case-sensitivity note.
3. Re-read the edited sentence beside `src/completion/web.ts`'s `completeSearchArgument` and the `web search -` and `web search foo -site:x` cases in `src/completion/web.test.ts`.
4. Confirm the wording agrees with the `After web` row in `documentation/user-documentation/command-bar/tab-completion.md` and the Completion sentence in `product/specs/web-search.md`.
5. Run `$janissary/scripts/run.mjs check-diff`.

## Design decisions

- **State the positional rule the code applies.** The completion checks that the dash is not the first word after `web search`, not that a query was parsed. Saying "only after the query: the dash must not be the first word after `web search`" gives a reader the behavior and the exact condition without promising query validation.
- **Name the empty case.** `web search -` is the line the missing condition affects, and the test pins it. Naming it tells a reader why the flags do not appear and what Tab does instead.
- **Keep the rest of the section.** The first-argument, value, no-candidate, disabled-row, and case-sensitivity rules all match `completeSearchArgument` and `completeWebCommand` as written.
- **No code or test change.** The implementation and its tests are correct; only the spec sentence is incomplete.
- **Leave the other two docs alone.** The user doc and `product/specs/web-search.md` already state the after-the-query rule, so changing them would be unrelated churn.

## Proposed changes

`product/specs/tab-completion.md`, `### Web command`, Candidates bullet. Only the flags sentence changes.

Before:

```markdown
After `web search`, a word starting with `-` offers the flags not already used: `--results`, `--max-chars`, `--depth`, and `--provider`.
```

After:

```markdown
After `web search`, a word starting with `-` offers the flags not already used — `--results`, `--max-chars`, `--depth`, and `--provider` — but only after the query: the dash must not be the first word after `web search`, so `web search -` leaves the line unchanged with no candidates.
```

No source, test, config, `help/`, or user-documentation change.

## Tests

No test changes. The behavior already exists and is pinned; only one spec sentence changes.

Existing cases that must keep passing unchanged through `$janissary/scripts/run.mjs check-diff`:

- `src/completion/web.test.ts` — `offers the flags not yet used after the query` proves flags appear once a query word precedes the dash and that used flags are removed.
- `src/completion/web.test.ts` — `offers nothing before the query or for a query word that looks like a flag` proves `web search -` and `web search foo -site:x` leave the line unchanged with no matches.

Verify the prose by reading it:

- The sentence says the flags complete only after the query.
- It states the dash must not be the first word after `web search`.
- It says `web search -` leaves the line unchanged with no candidates.
- It does not claim the completion validates or parses the query.

## Verification

- `$janissary/scripts/run.mjs check-diff`.
- Read `product/specs/tab-completion.md`'s `### Web command` section beside `src/completion/web.ts`'s `completeSearchArgument` and `src/completion/web.test.ts`.
- Confirm the `After web` row in `documentation/user-documentation/command-bar/tab-completion.md` and the Completion sentence in `product/specs/web-search.md` still agree with the corrected sentence.

## Spec

This fix is itself the spec correction. `product/specs/tab-completion.md`'s `### Web command` Candidates bullet gains the after-the-query condition and the `web search -` no-candidate case. No other spec section describes this rule.

## Out of scope

- Changing `src/completion/web.ts`, `src/completion/web.test.ts`, or any other source or test file.
- `documentation/user-documentation/command-bar/tab-completion.md` and `product/specs/web-search.md`; both already word the rule correctly.
- The rest of the `### Web command` section: the first-argument `search` rule, the `--depth` and `--provider` value rules, the `--results` and `--max-chars` no-candidate rule, the disabled-row behavior, and the case-sensitivity note.
- Other spec sections and other spec files.
- Other backlog entries on the branch.
- Rebasing, merging, or resolving the branch's conflict with `master`.

## Rating basis

lines_added=0, files_edited=0, requirements=2, scenarios=0, new_units=0. Production counts are zero because the only edited file is a spec page; the two requirements are the after-the-query condition and the `web search -` no-candidate case, and no test scenario applies to spec prose. p = 1.578 + 0.705·ln(3) = 2.35, under the 3.461 threshold for 1.
