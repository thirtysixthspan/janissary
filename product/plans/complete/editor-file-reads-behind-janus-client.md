# Move the editor's file reads behind `JanusClient`

**Complexity: 5/10** — two small methods on an existing service, two hooks repointed at them, one parameter dropped from a hook signature, and one plugin capability delegating instead of hand-rolling. No new architecture, no wire-protocol change, and nothing a user can observe changes. The weight is in the tests: two hooks that could not be tested before become testable, and this is where their first colocated tests land.

`web/src/editor/useEditorFile.ts` builds an authenticated URL and calls `fetch` itself at line 51, and re-derives the session token from `location.search` at line 63; `web/src/editor/useEditorWatchReload.ts` re-derives the same token at line 22. Hooks reach straight to the network, past the service that already owns the connection — against §8 of `ai/guidelines/react-code-organization.md` (each layer imports downward only; a hook reaches the outside world through a service) and §7 (the service owns the effects).

The coupling is already visible in the signatures: `useEditorWatchReload` takes `fetchContent` as its sixth parameter purely to borrow the closure `useEditorFile` built around `fetch`. Neither hook has a colocated test today — that is the symptom, since neither can be exercised without stubbing global `fetch` and `location` — while the save path three lines away already goes through `client.saveFile`.

## Goal

The editor's hooks name a file and get its text; they never touch `fetch`, `location`, or a token. The token rule lives in exactly one place on `JanusClient`, and both editor hooks and the plugin resource capability read it from there. `useEditorWatchReload` loses the `fetchContent` parameter it only had to borrow a closure.

## Design decisions

**Two methods, not one.** `readFile(url)` is what the editor wants — a URL in, text out, an error thrown on a bad status. `resourceUrl(reference)` is what a caller wants when it must hand the URL to something else rather than fetch it (an `<img src>`, a plugin's own `fetch`). `readFile` is written in terms of `resourceUrl`, so the token rule has one home and the two methods cannot drift.

**`readFile` throws rather than returning an error string.** `saveFile` resolves with an error message because a failed save is a message the user must see and dismiss. A failed read is different: `useEditorFile` already catches and turns it into `Failed to load <name>`, and `useEditorWatchReload` deliberately swallows it as best-effort. Throwing keeps both call sites exactly as they are, where an error-string return would force both to grow a branch.

**`resourceUrl` reads the token per call, not once in the constructor.** The constructor's WebSocket URL is built at construction because the socket is opened once; a resource URL is built per request. Reading `location.search` at call time keeps the method a pure function of the current location and avoids a second cached copy of the same value — the thing this change exists to remove.

**The plugin capability keeps its own copy, for now.** `web/src/plugins/api.ts:59` holds a fourth copy of the token rule, inside the `resourceUrl` capability handed to plugins, and delegating it to `client.resourceUrl` looks like a one-line win. It was tried and backed out: every plugin test that renders a tab stubs the client as a bare `{ send, request }`, so the delegation makes six unrelated plugin test files fail on a missing method. That is a wider change than this item asks for — it scopes itself to `ws.ts` and the two editor hooks — and it belongs with whatever next tidies the plugin capability surface. `JanusClient.resourceUrl` is still worth adding now: it is the rule `readFile` is built on, it is what the next non-editor caller reaches for instead of copying, and it is directly covered by the client's own tests.

**`useEditorWatchReload` takes the client, not a reader function.** Its sixth parameter existed only to borrow `useEditorFile`'s closure. Taking `client` and calling `client.readFile(url)` itself means the two hooks no longer have to be wired to each other, which is the coupling the item points at. It needs the URL too, so `editor.url` joins its parameters in the reader's place — a like-for-like swap, not a longer list.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The service that already owns the connection and one file operation | `web/src/ws.ts` (`saveFile`) |
| The token rule, in its four current copies | `ws.ts:35`, `plugins/api.ts:59`, `useEditorFile.ts:63`, `useEditorWatchReload.ts:22` |
| The `fetch` + non-ok-throws shape to move | `useEditorFile.ts:50`–`:54` |
| The faked socket the client's tests render against | `web/src/ws.test.ts:5`–`:29` |
| The editor API the hooks drive | `EditorApi` in `web/src/editor/useEditor.ts:14` |

## Implementation steps

1. **`web/src/ws.ts`: add the two methods.** `resourceUrl(reference: string): string` returns `` `${reference}?token=${encodeURIComponent(token)}` `` with the token read from `location.search`. `readFile(url: string): Promise<string>` fetches `this.resourceUrl(url)`, throws `HTTP <status>` when the response is not ok, and returns `r.text()`. Place both beside `saveFile`, which is the other file operation.

2. **`web/src/editor/useEditorFile.ts`: delete `fetchContent`.** The load effect calls `await client.readFile(editor.url)` directly and drops the `token` line. The `try`/`catch` and the `cancelled` guard stay exactly as they are.

3. **`web/src/editor/useEditorWatchReload.ts`: take the client and the URL.** Replace the `fetchContent` parameter with `client` and `url`, drop the `token` line, and call `client.readFile(url)`. The `mtimeMs` effect, the dirty check, the conflict flag, and the best-effort `catch` are untouched.

4. **`web/src/editor/useEditorFile.ts`: update the call.** Pass `client` and `editor.url` where `fetchContent` was.

5. **`web/src/EditorTab.test.tsx`: teach the fake client to read.** Its `makeClient` returns a bare `{ saveFile, editorSync, request, send }`, and the tab's load now goes through `client.readFile` rather than global `fetch`. Give the fake a `readFile` that calls global `fetch` the way the real one does, so the dozen `vi.stubGlobal('fetch', …)` sites and their call-count assertions keep working as written.

## Tests

- `web/src/ws.test.ts` — new cases for the two methods: `resourceUrl` appends the current token and percent-encodes it; `readFile` resolves with the body text for an ok response, throws `HTTP 404` for a non-ok one, and requests the URL `resourceUrl` builds.
- `web/src/editor/useEditorFile.test.ts` (new — the hook's first colocated test, and the point of the change) — against a stub client, with no global `fetch` or `location` in play: a mounted hook loads the file's text into the editor and records it as last-saved; a load failure surfaces as `Failed to load <name>`; a tab still `provisioning` does not read at all; an already-loaded buffer is not re-read; `save` writes the buffer through `client.saveFile` and clears the dirty state; a save error surfaces without clearing it.
- `web/src/editor/useEditorWatchReload.test.ts` (new — likewise) — a new `mtimeMs` on a clean buffer reloads the text through `client.readFile` and preserves the cursor line; a new `mtimeMs` on a dirty buffer sets the conflict flag and does not read; an unchanged `mtimeMs` does nothing; a failed read leaves the buffer alone.
- `web/src/EditorTab.test.tsx` — every case keeps its assertions; only the fake client grows the `readFile` described in step 5. It renders the whole tab and is the check that the two hooks are still wired to each other correctly.

## Out of scope

- **The token's own design** — how it is minted, how long it lives, or moving it out of the query string. This change only stops copying the rule that reads it.
- **The plugin `resourceUrl` capability's copy of the token rule**, and routing plugin `fetch` calls through the client. See the design note above: the delegation is a wider change than this item, and the plugin-facing contract does not move here.
- **Changing `saveFile`'s error-string contract** to match `readFile`'s throw. The two failure modes genuinely differ; unifying them would change what the user sees.
- **Giving `JanusClient` the rest of the editor's file operations** (rename, delete, watch registration). Only the read the hooks hand-rolled moves.
- **`web/src/editor/useEditor.ts` and the edit model.** Untouched.
