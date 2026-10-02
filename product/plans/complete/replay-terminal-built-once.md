# Build the replay terminal once its recorded size is known

**Complexity: 2/10** — one hook's signature, one guard, one cursor reset, and a test that pins the
contract through the component. No new module and no change to the player's behavior once the header
has arrived.

`useReplayTerminal` creates the terminal at a fallback 80x24 and lists the recorded columns and rows as
effect dependencies, so a recording of any other size tears the terminal down and builds a new one
moments after it opens. The hook's `cursor.current`, which records how far the terminal has been fed,
survives that rebuild and is never reset, so every event written before it is dropped and never
re-written — which is how a replay of any recording that is not 80x24 opens showing a partial or empty
screen that only a backward seek happens to repair.

The plan already said the terminal should be created "once that header has arrived rather than before
it". Making that literal removes the fallback rather than repairing its consequences.

## Approach

The hook takes the recording's header, which is `undefined` until the file's first line has been read,
and declines to build until it is there. A terminal that does not exist yet is a state the hook's
`renderUpTo` already handles by doing nothing, so the only visible consequence is that playback waits
for the header — which it already did, since there is nothing to write before then.

The cursor is reset where the terminal is created as well as where a backward seek resets it, so a
future rebuild cannot silently skip the bytes before it.

## Implementation steps

1. In `web/src/plugins/replay/useReplayTerminal.ts`, take the header itself rather than a fallback
   grid, and return from the setup effect while it is absent. Reset `cursor.current` when the terminal
   is constructed.
2. In `web/src/plugins/replay/ReplayTab.tsx`, pass the header through unchanged.
3. Keep the fallback out: a recording whose header never parses has no recorded grid, so there is
   nothing honest to build, and the tab already says why on its metadata line.

## Tests

- `web/src/plugins/replay/ReplayTab.test.tsx`: the stubbed terminal hook is asserted to be asked for
  nothing before the header arrives and for the recording's own columns and rows once it does, which is
  the whole of this contract. The file already stubs that hook because jsdom has no xterm, so this
  needs no new test file and no new environment.
- Every existing case in that file must keep passing untouched; a change that makes the transport or the
  metadata line depend on the terminal existing will show up there.

## Out of scope

- Anything about how bytes are written, reset, or seeked.
- The recorded font scaling, the copy chord, and the colours.