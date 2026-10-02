# Report an unparseable recording on the tab that opened it

**Complexity: 2/10** — one bullet moves in a spec, one in a user page, and a sentence each. No code,
no test, no new module.

`harness replay`'s refusal list appears twice on this branch, in `product/specs/harness.md` and in
`documentation/user-documentation/advanced-agents/harness.md`, and both list `Cannot play <name>:
<reason>.` among the lines the command posts to the notifications feed for a `.cast` file whose header
or events cannot be read. Nothing produces that sentence. The parse is the player's: `CastStream`
records the reason, `useReplaySource` carries it on `source.error`, and `ReplayMeta` draws it beside
the recording's own facts. The server never sees it, so it cannot post it — opening a recording whose
header is not JSON opens the tab, prints `the file is not an asciicast recording` on its metadata line,
and leaves the feed empty.

The other four lines in the list are decided on the server, before any tab exists, and all four behave
as written. Only this one belongs to a different moment in the command's life.

## Approach

Say where the reason actually appears, and keep the feed's list to the refusals that reach it. The
paragraph the bullet sat in already establishes that refusals are feed lines with nothing in the
transcript, so the correction reads naturally as a sentence after the list: a file the player opened
and then could not parse is not a refused command — the tab is already there, focused, saying why.

## Implementation steps

1. In `product/specs/harness.md`, remove the `Cannot play <name>: <reason>.` bullet from the
   `harness replay` refusal list and add a sentence after the list saying that a recording the player
   opens but cannot parse reports the reason on the replay tab's own metadata line and posts nothing to
   the feed.
2. In `documentation/user-documentation/advanced-agents/harness.md`, make the same correction in its
   refusal list, keeping its promise that the transcript still holds only the command.
3. Leave `help.md` alone: it never listed this line.

## Tests

None to write. The behavior the correction describes is the behavior already covered —
`web/src/plugins/replay/cast-stream.test.ts` pins the parse reasons the metadata line shows, and
`src/harness/replay-subcommand.test.ts` pins the four refusals that do reach the feed. No test asserts
the prose of either file, so nothing needs updating and nothing new is needed; the docs build and
`plugins/documentation.test.ts` still have to pass.

## Out of scope

- A client-to-server notification for a parse failure. The reason is the focused tab's own state and is
  already on screen; a feed line would duplicate it.
- The four refusals the server does post, their wording, and the classification that keeps them out of
  focus suppression.