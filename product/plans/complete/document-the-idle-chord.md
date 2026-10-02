# Document and test the idle-limit chord

**Complexity: 1/10** — one row in two key tables, one row in the pull request description, and one
test case. The chord already works; nothing about the player changes.

The replay tab binds `i` to cycle the idle-time limit, but neither key table — the one in the
recordings section of the harness documentation and the one in the recording player's own page — lists
it, and the description's key table does not either. The tab's test exercises the idle control by
clicking its button rather than by pressing the key, so the chord and the button are separately
unverified as being the same action.

An undocumented chord is invisible to the person who would have relied on it and to the reviewer
deciding whether the tab's key handling is reasonable, which is why this is worth a row rather than a
nickname.

## Implementation steps

1. Add the `i` row to the key tables in `documentation/user-documentation/advanced-agents/harness.md`
   and `documentation/user-documentation/tab-types/recording-player.md`, which already list the same
   chords and should stay in step.
2. Update the pull request description's key table the same way, leaving every other paragraph of it
   as the author wrote it.
3. Note in the chord switch's comment in `web/src/plugins/replay/ReplayTab.tsx` that the idle chord is
   deliberately unshifted, so it cannot collide with the keys the terminal underneath claims. Change no
   behavior there.

## Tests

- `web/src/plugins/replay/ReplayTab.test.tsx`: a case pressing `i` and asserting the idle control's
  label advances, beside the existing case that clicks the same button. Together they pin that the
  chord and the control are one action, which is exactly what the documentation now claims.

## Out of scope

- Adding, moving, or rebinding any chord.
- Any change to the idle rule, the limit a recording carries, or how compression is applied.