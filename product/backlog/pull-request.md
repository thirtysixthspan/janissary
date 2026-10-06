<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

## `shell` recording drops the terminal palette

Every asciicast this branch writes carries only `term.theme.fg` and `term.theme.bg`, so a recording made under any palette replays against the default 16 colors. The protocol message, the `TerminalColors` type, and the recorder all carry the palette, but the message handler rebuilds the object it forwards and leaves `palette` behind.

Observed twice in a browser run, under the Material Dark shell tab: `fg=#e4e5e7 bg=#17181b paletteEntries=0 theme={"fg":"#e4e5e7","bg":"#17181b"}`, where the `theme` value is read back from a written `.cast`.

`src/message/handler.ts` destructures only `{ id, fg, bg }` from the `reportTerminalColors` params and calls `controller.reportTerminalColors(id, { fg, bg })`. Forward the palette through, validate it with `isTerminalColors` the way the other fields are, and cover the forwarded palette with a test.