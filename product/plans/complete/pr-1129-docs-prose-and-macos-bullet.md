# PR 1129 — fix the spliced docs sentence and the description's macOS bullet

Complexity: 2/10

## Goal

"Copying text out of a harness" ends its modifier sentence on the unrelated clause "and
canvas colours aren't carried across — what is copied is the text", jargon a reader of
that page has no use for; the description's seventh behavior example is two unrelated
claims with a typo ("copy greet" gree→drag), mixing the clearing triggers that already
live in its sixth entry.

## Approach

End the "The modifier is needed because…" sentence at "keeps that one drag for yourself"
and state the snapshot-styling point in the freeze paragraph in user terms — the frozen
image carries the text, not the harness's colours or bold. Rewrite the seventh
description bullet with `gh pr edit --body-file` to make its single claim: Option+drag on
macOS now reaches the harness as an ordinary reported drag, because Shift+drag replaced
it as the selection gesture. Title untouched; every other paragraph preserved
byte-for-byte. Nothing executable changes.

## Implementation steps

1. `documentation/user-documentation/advanced-agents/harness.md`: the two-part prose fix.
2. `./temp/pr-body.md` from the current body minus the seventh bullet rewrite; apply with
   `gh pr edit 1129 --body-file ./temp/pr-body.md`.
