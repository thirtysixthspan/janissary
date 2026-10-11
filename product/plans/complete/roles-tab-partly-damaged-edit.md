# Refuse edits while the roles file is partly damaged

**Complexity: 2/10** — one added condition in the edit path, one test, one spec sentence; no new module and no behavior change on a clean file.

## Goal

A file that decodes partly is served with a problem line, but the edit path read that same partly decoded list and rewrote the whole file from it, so the first edit after the problem line appeared silently discarded the malformed parts. This fix refuses the edit while any file in effect is in that state, so the damaged file is left exactly as it is until the user fixes it.

## Approach

Widen the single guard in `edit()` that already refuses a fully unusable file to also refuse a read that carries any `problem` — the partial-loss read reports its source as the file it read, so the existing `source === 'default'` check does not catch it. One refusal message covers both states; the partial-loss line the tab already shows names what was dropped.

## Implementation

1. **`src/plugins/roles/activate.ts`** — in `edit()`, change the guard from `read.source === 'default'` to `read.source === 'default' || read.problem !== undefined`, keeping the existing message `roles.json at <path> is unusable — fix the file before editing roles.` and a comment explaining why a partly decoded read must not be rewritten.
2. **`product/specs/roles.md`** — the "When a file does not decode" section already says a fully undecodable file refuses edits; extend it to cover the partial-loss state and to say the file is left as it is until it is fixed.

The read path is untouched: a partial-loss read still serves the roles that decoded and still reports the count, so the tab keeps showing the good roles; only the write is refused. A clean file's edit path is unchanged.

## Tests

`src/plugins/roles/activate.test.ts`:

- a file holding one well-formed role and one role missing its entries list refuses a `describe-role` edit, its bytes on disk are unchanged afterward, and the refusal message names the path;
- the existing fully-unusable-file refusal and every clean-file edit case keep passing unchanged.

## Out of scope

- Writing back only the parts a user touched and copying the rest verbatim from the raw file — a second decode path, deliberately not taken here.
- Changing the partial-loss decode, the count, or the problem line's wording.
- Changing what a refusal says for the fully unusable case.
- The other recorded entries, which are worked separately.