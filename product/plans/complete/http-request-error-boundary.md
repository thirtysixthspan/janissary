# Give the HTTP request handler one error boundary and stream ranged reads through a pipeline

**Complexity: 3/10**: two small, local changes to the HTTP serving path (one new focused module, one line swapped in `src/open/route.ts`) plus tests. No new architecture, no wire change, and no change to what is reachable.

The static and `/open/` handler in `src/index.ts` runs as `createServer((request, res) => { void serveStatic(request, res); })`, which discards the promise. Inside it, `new URL(request.url ?? '/', 'http://localhost')` and `decodeURIComponent(...)` run unguarded, so a loopback request for `//` (a `TypeError: Invalid URL`) or a token-bearing `/open/%E0%A4%A` (a `URIError`) rejects that promise. Nothing in `src/` or `bin/` handles `unhandledRejection`, so Node's default terminates the server and every agent tab with it. Separately, `serveOpenFile` in `src/open/route.ts` does `createReadStream(filePath, { start, end }).pipe(res)`: `.pipe` attaches no error listener to the file stream (a file removed between the `stat` and the open emits an unhandled `error`, which also crashes the process) and does not destroy the file stream when the client aborts a seek, so abandoned range requests leak file handles.

## Goal

A request the handler cannot parse is answered `400 bad request`, any other failure inside the handler is answered `500 internal error`, and when headers have already gone out the response is destroyed instead. Either way the server keeps serving the next request. A ranged read releases its file stream when the client goes away, and a read error after the `stat` is contained to that one response.

## Approach

1. **New module `src/request-boundary.ts`.** It exports two functions:
   - `answerRequestFailure(res, error)`: if `res.headersSent`, call `res.destroy()`; otherwise answer `400` with body `bad request` when the error is a `TypeError` or `URIError` (the two failures URL parsing and percent-decoding produce), and `500` with body `internal error` for anything else.
   - `guardRequest(handler)`: takes the async `(request, res) => Promise<void>` handler and returns the synchronous request listener `createServer` wants, catching the handler's rejection and routing it to `answerRequestFailure`.

   A separate module keeps `src/index.ts` (182 raw lines) comfortably under the 200-line limit and makes the boundary testable without starting the whole server. The existing `403`/`404` answers in `serveStatic` carry no security headers, and the new ones match them.

2. **`src/index.ts`**: replace `createServer((request, res) => { void serveStatic(request, res); })` with `createServer(guardRequest(serveStatic))`. Wrapping at the listener rather than inside `serveStatic` puts every current and future line of the handler inside the boundary, which covers the proposal-risk case of a later-added code path escaping.

3. **`src/open/route.ts`**: replace `createReadStream(...).pipe(res)` with `pipeline(createReadStream(...), res, callback)` from `node:stream`. `pipeline` destroys both streams when either side errors or closes early, so a client abort destroys the file stream and a read error destroys the response instead of being emitted with no listener. The callback has nothing further to release; it carries a one-line comment saying so.

### Rejected alternatives

- A process-wide `unhandledRejection` handler: it would keep the process alive but leave the request hanging with no answer, and it hides every other bug of the same shape.
- Wrapping only the two throwing calls (`new URL`, `decodeURIComponent`) in local try/catch: it fixes today's two crashes but leaves the next unguarded line in the handler able to take the server down.

## Implementation steps

1. Add `src/request-boundary.ts` with `answerRequestFailure` and `guardRequest`.
2. Use `guardRequest(serveStatic)` in `src/index.ts`.
3. Switch the ranged read in `src/open/route.ts` to `pipeline`.
4. Add the tests below and run `./scripts/run.mjs check-diff`.

## Tests

- `src/request-boundary.test.ts` (new): a `TypeError` and a `URIError` answer `400 bad request`; any other error answers `500 internal error`; a failure after headers were sent destroys the response rather than writing a second status line; a handler that resolves normally is left alone.
- `src/index.test.ts`: a raw `GET //` with a loopback Host header answers `400` and the server still answers the next request with `200`; an `/open/` path with a malformed percent escape and a valid token answers `400` and the server still answers the next request.
- `src/open/route.test.ts`: a client that aborts a ranged response mid-stream leaves the file stream destroyed (observed by wrapping `createReadStream` through a `vi.mock` of `node:fs`); a file that disappears after `stat` (a `vi.mock` of `node:fs/promises` whose `stat` reports a size for a path that does not exist) ends that response without an uncaught error, and the route still serves the next request.
- The existing "rejects an /open/ request with no token", "serves security headers" cases in `src/index.test.ts`, and the range cases in `src/open/route.test.ts`, stay unchanged and passing.

## Spec updates

- `product/specs/open.md`: the paragraph on inline views fetching through their registered reference gains the rule that a request the server cannot parse is answered as a bad request and the server keeps serving.
- `product/specs/video-tab.md`: "Serving the video" gains that an abandoned partial response releases the file, and a file that vanishes mid-request ends only that response.

## Out of scope

- Adding security headers to the error answers (`403`, `404`, and the new `400`/`500`); none of the existing error answers carry them.
- The WebSocket upgrade path, which already guards its own parsing through `tokenFromReq`.
- A process-wide `unhandledRejection` handler.
