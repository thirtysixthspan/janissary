# Stop passing the protocol client into the transcript's presentational renderers

**Complexity: 5/10** — one new pure module, one predicate lifted into an existing one, a parameter swap threaded through six renderers, and the terminal card's hand-off moved up one level. Two files call `renderLine`, and no user-visible behavior changes.

`web/src/transcript-line.tsx` hands `client: JanusClient` to renderers that have no business holding a service instance, and they issue protocol calls straight from JSX handlers:

- `OpenFileLink` sends `edit <path>` from its `onClick` (line 101).
- `renderMarkdownLine` decides between `edit` and `open` with the `FILE_LINE_LINK` regex and sends the result (lines 114–117).
- `renderMessageTab` sends `{ method: 'focusTab' }` (line 159).
- `renderTextContent` and `renderAnsiSegments` forward the client into `renderFileLinkSegments`, which sends `open <url>` / `edit <path>:<line>` of its own (`file-link.ts:119`–`:128`).

That violates §5 of [`react-code-organization.md`](../../ai/guidelines/react-code-organization.md) (a presentational component takes the data it renders and the callbacks it invokes, never a service instance) and §8 (a component reaching past its hook into a service).

The cost is that the command-string rules are untestable without a fake client and unreachable from anywhere else — `transcript-line.test.tsx` builds a `{ send }` stub in eleven places and asserts on wire payloads to check what are really two-line decisions — and every new transcript line type adds another inline protocol call.

## Goal

`web/src/transcript-line.tsx` imports nothing from `ws.ts`. Its renderers take three callbacks — `onOpenFile`, `onEditFile`, `onFocusTab` — and the code that turns those into `client.send` calls is one plain function, testable with a `{ send: vi.fn() }` fake and no render.

## Design decisions

**An intent object, not three positional callbacks.** `renderLine` already takes six parameters; replacing `client` with one `TranscriptIntents` value keeps the arity exactly as it is and lets the object thread down through five private renderers without each of them growing three parameters.

**The factory is a plain function; `Transcript.tsx` memoizes it.** `transcriptIntents(client)` calls no React hook, so per §6 it must not carry a `use` prefix — it is a plain function in a pure module, which is precisely what makes the command strings testable without rendering. `Transcript.tsx` wraps it in `useMemo(…, [client])` because `Markdown`'s `onLinkClick` feeds a `useCallback` dependency array, so a fresh object each render would re-create that callback on every line.

No custom `useTranscriptIntents` hook: it would be one `useMemo` with one caller and no reactive logic to name, and §6 says not to extract for that.

**The `edit`/`open` decision goes into `file-link.ts`, not a new module.** `isFileLineLink(href)` is the question "does this href name a file and a line", and `file-link.ts` already owns what counts as a file link — its segment parser answers the same question about raw text. Putting the predicate there keeps that knowledge in one module with the test file that already covers it, instead of opening a third file for six lines.

**`renderFileLinkSegments` takes intents too.** It is the fourth renderer issuing protocol calls, and `renderTextContent` cannot shed its `client` parameter while still forwarding one. Its `url` segments call `onOpenFile`, its `link` segments call `onEditFile` with `path:line` — the same two commands it builds inline today.

**`TerminalCard` moves up to `Transcript.tsx`.** It is the one line type that genuinely needs the client: `useXterm` attaches a PTY to it and its kill button sends `ptyKill`. Wrapping it in a render-prop slot on the intent object would smuggle a service back through a parameter named for callbacks. §7 puts service wiring at the container that owns the instance, so `Transcript.tsx` renders the terminal line itself and calls `renderLine` for every other type. `renderLine` loses its `terminal` branch and its `TerminalCard` import along with it.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The `FILE_LINE_LINK` regex to lift | `web/src/transcript-line.tsx:12` |
| The two command strings the segments build | `web/src/file-link.ts:119` |
| The link-parsing module and its suite | `web/src/file-link.ts`, `web/src/file-link.test.tsx` |
| The only two `renderLine` callers | `web/src/Transcript.tsx:66`, `web/src/transcript-line.test.tsx` |
| The `useXterm` mock pattern for rendering a terminal card in jsdom | `web/src/TerminalCard.test.tsx:7`–`:9` |
| The three `Transcript` consumers, unaffected (they pass `client` as they do today) | `AgentTabBody.tsx:120`, `InactiveAgentTabBody.tsx:42`, `NotificationsTab.tsx:36` |

## Implementation steps

1. **New module `web/src/transcript-intents.ts`.** Export the `TranscriptIntents` type — `onOpenFile(target)`, `onEditFile(target)`, `onFocusTab(label)`, all returning `void` — and `transcriptIntents(client: JanusClient): TranscriptIntents`, which builds the three `client.send` calls: `{ method: 'command', params: { text: \`open ${target}\` } }`, the same with `edit`, and `{ method: 'focusTab', params: { label } }`. The client type is imported type-only and the instance arrives as a parameter, so nothing here imports a singleton.

2. **`web/src/file-link.ts`: add the predicate, swap the parameter.** Move the `FILE_LINE_LINK` regex here as `isFileLineLink(href: string): boolean`. Change `renderFileLinkSegments(segments, client)` to `renderFileLinkSegments(segments, intents)` — `url` segments call `intents.onOpenFile(seg.url)`, `link` segments call `intents.onEditFile(\`${seg.path}:${seg.line}\`)`, both still inside the existing `e.stopPropagation()` handler.

3. **`web/src/transcript-line.tsx`: thread intents, drop the client.** Delete the `JanusClient` and `TerminalCard` imports and the `FILE_LINE_LINK` constant. Replace the `client` parameter with `intents: TranscriptIntents` on `renderLine`, `renderTextContent`, `renderMarkdownLine`, `renderMessageTab`, `renderAnsiSegments` (still optional — the `running`/`acp` branches pass nothing), and `OpenFileLink`. Their bodies call the intents: `OpenFileLink` → `onEditFile(path)`; `renderMessageTab` → `onFocusTab(openTab)`; `renderMarkdownLine` → `isFileLineLink(url) ? onEditFile(url) : onOpenFile(url)`. Remove the `line.type === 'terminal'` branch.

4. **`web/src/Transcript.tsx`: build the intents and own the terminal card.** Import `TerminalCard` and `transcriptIntents`, add `const intents = useMemo(() => transcriptIntents(client), [client])`, and render each line as a terminal card when `line.type === 'terminal' && line.terminal` (keyed by `ptyId`, as `renderLine` keys it today) or through `renderLine(line, index, intents, …)` otherwise. The `client` prop stays — the terminal card still needs it.

## Tests

- **New `web/src/transcript-intents.test.ts`** — the payoff of the change, and it renders nothing: against a `{ send: vi.fn() }` fake, `onOpenFile('https://example.com')` sends `open https://example.com`, `onEditFile('src/foo.ts:42')` sends `edit src/foo.ts:42`, and `onFocusTab('build')` sends `{ method: 'focusTab', params: { label: 'build' } }`.
- **`web/src/file-link.test.tsx`** — new cases for `isFileLineLink`: true for `src/foo.ts:42` and `/abs/path.ts:1`, false for `https://example.com`, a bare word, and a path with no line number. The three existing `renderFileLinkSegments` cases swap their `{ send }` client for an intents fake and assert `onEditFile`/`onOpenFile` were called with the target rather than a command string.
- **`web/src/transcript-line.test.tsx`** — every case swaps `clientStub` / `{ send }` for an intents fake. The five that asserted on wire payloads now assert on the intent: the markdown https link calls `onOpenFile('https://example.com')`; the markdown `src/foo.ts:42` link calls `onEditFile('src/foo.ts:42')`; plain markdown text calls neither; a file-link inside an ANSI-colored output line calls `onEditFile('src/foo.ts:42')`; a message's `openFile` calls `onEditFile('/captures/claude-now.txt')`; a message's `openTab` calls `onFocusTab('build')`. Every other case keeps its assertion unchanged.
- **New `web/src/Transcript.test.tsx`** — covers the hand-off this change moves, which nothing tests today: with `./useXterm` mocked as `TerminalCard.test.tsx` does, a `terminal` line renders a terminal card carrying the program name, and a non-terminal line beside it still renders through `renderLine`.

## Out of scope

- **The `client` prop on `Transcript` itself, and on its three callers.** `TerminalCard` needs a real client; pushing that up to `AgentTabBody`/`InactiveAgentTabBody`/`NotificationsTab` is a different change.
- **`TerminalCard`'s own use of the client.** It is a service-bound component by nature — this plan moves where it is rendered, not what it holds.
- **Moving the transcript into a feature directory.** The transcript's files are still in the flat `web/src/` root; gathering them is its own item, like the file navigator's was.
- **Changing any command string, the `edit`/`open` rule, or the wire protocol.** The same commands go out for the same clicks.
- **`renderMarkdown` / `linkifyMarkdown` and the sanitizer.** Untouched.
