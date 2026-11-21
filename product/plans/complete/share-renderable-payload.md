# Share the renderable payload between transcript entries and buffer lines

**Complexity: 4/10** — ~38 added lines across 3 production files, 6 requirements, 7 scenarios (p=5.13).

## Goal

Declare the renderable fields a transcript entry carries once, and have every buffer line produced from an entry receive them through one forwarding helper, so a new renderable field cannot be added to the transcript type and silently dropped on the way to the view.

## Approach

Introduce `RenderablePayload` in `src/tab/types.ts` holding the eight fields `LogEntry` and `BufferLine` both carry, and compose both declarations from it. Add one `renderablePayload(entry)` forwarder in `src/buffer.ts` that returns exactly that type; because its return type is `RenderablePayload`, adding a field to the type becomes a compile error at the forwarder until it is forwarded. Spread that payload on every buffer line the flattening path produces, so the stored transcript and the view model cannot drift. Keep the shape-specific work — splitting output into lines, spacers, tool-step collapsing, Markdown — where it is.

## Implementation steps

1. In `src/tab/types.ts`, add `RenderablePayload` with `from`, `fromColor`, `msgKind`, `acp`, `running`, `terminal`, `openFiles`, `openTab`. Compose `LogEntry = RenderablePayload & { ... }` and `BufferLine = RenderablePayload & { ... }`, leaving `LogEntry`'s `input`/`output`/`cwd`/`markdown`/record fields and `BufferLine`'s `type`/`text`/`cwd` on the shape-specific side.
2. In `src/buffer.ts`, add `renderablePayload(entry: LogEntry): RenderablePayload` that destructures and returns the eight shared fields, and spread it onto the lines `formatMessageContent` produces.
3. In `src/tab/formatting-handlers.ts`, import the forwarder and spread the payload onto the terminal, prompt, output, and Markdown lines the handlers produce; keep the collapsed-summary line's `acp` flag and the `(N tool steps)` text unchanged.
4. Confirm every rendered string is byte-for-byte identical, including tab expansion, spacers, the collapsed label, and the extra output lines of a message.

## Tests

Add a case in `src/tab/formatting-handlers.test.ts` that builds a `LogEntry` with all eight shared fields populated, flattens it, and asserts every field survives on the resulting `BufferLine`. Keep `src/buffer.test.ts`, `src/tab/formatting-handlers.test.ts`, `src/tab/index.test.ts`, and `src/search-matches.test.ts` green.

## Out of scope

- Merging `LogEntry` and `BufferLine` into a single type: one is the durable transcript, the other a transient render row with a `type` discriminator and spacer lines.
- Changing any rendered text, links, tab expansion, collapsing behavior, or the wire shape of `BufferLine`.
