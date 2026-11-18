# Correct the stale native-command counts in the subagent specs

**Complexity: 1/10** — prose-only count corrections in two specs: 0 production files/lines, 0 requirements, 0 scenarios, 0 new units (p=1.58).

The pull request ships an eighteen-command native ACP vocabulary: `NATIVE_ACP_COMMANDS` in
`src/plugins/roles/shared.ts` lists eighteen entries — the built-in master/tell role's seventeen
plus `subagent`. Three sibling documents already say eighteen (`product/specs/roles.md`,
`help/tell.md`, and `documentation/user-documentation/tab-types/roles.md`), and
`product/specs/acp.md`'s file-read paragraph already says tell grants eighteen. Two prose counts
still disagree: `product/specs/application-commands.md`'s subagent paragraph says the native
vocabulary has fifteen, and `product/specs/acp.md`'s file-patch paragraph says the built-in tell
role grants it by default with seventeen.

Verified against the code and the sibling docs before acting: both numbers are stale, and the
correct value is eighteen in both places. No code path, command, or behavior changes.

## Goal

Bring the two stale spec paragraphs in line with the eighteen-command vocabulary so the whole set
of specs and docs agrees on the count. A reader trusting either spec should not be led to
misjudge the native command inventory or the built-in tell role's grants.

## Approach

Two one-word prose substitutions, each inside the paragraph the entry names:

1. In `product/specs/application-commands.md`, subagent paragraph: "The native vocabulary has
   fifteen commands" becomes "The native vocabulary has eighteen commands".
2. In `product/specs/acp.md`, file-patch paragraph: "the built-in `tell` role grants it by
   default with seventeen commands" becomes "the built-in `tell` role grants it by default with
   eighteen commands".

Everything else in both paragraphs, including the surrounding caveats, stays byte-for-byte the
same. The entry calls for no PR description change, so the title and body are left alone.

## Implementation steps

1. Edit the `fifteen` count in `product/specs/application-commands.md` to `eighteen`.
2. Edit the `seventeen` count in `product/specs/acp.md` to `eighteen`.
3. Re-read both edited paragraphs and confirm all four documents
   (`product/specs/application-commands.md`, `product/specs/acp.md`, `product/specs/roles.md`,
   `help/tell.md`, and `documentation/user-documentation/tab-types/roles.md`) agree on eighteen,
   with no stale `fifteen`/`seventeen` count left in the spec set.
4. Run `./scripts/run.mjs check-diff` (spec-only change; expected to have nothing scoped to lint
   or test).

## Tests

None — no code changed. Verification is re-reading the two edited paragraphs and grepping the
spec set and sibling docs for the superseded counts; `NATIVE_ACP_COMMANDS` remains the source of
truth and is untouched.

## Out of scope

- Any code change — `src/plugins/roles/shared.ts` already lists eighteen entries correctly.
- The pull request's title and description — the entry names no description correction.
- Other command-count statements that are already correct, including `product/specs/acp.md`'s
  file-read paragraph and the three sibling docs that say eighteen.

## Verification

Re-read both edited spec paragraphs and grep `product/specs/`, `help/`, and
`documentation/user-documentation/` for `fifteen` and `seventeen` as command counts; expect no
stale count. Run `./scripts/run.mjs check-diff`.
