# Make the RPC dispatcher exhaustive over `ClientMessage['method']`

**Complexity: 2/10** — one exported helper, one `default` branch in each of the two dispatch switches, and the tests that pin the new answer. No signature change, no wire-protocol change, and no behavior change for any method that has a handler.

`CLIENT_METHOD_CONTRACTS` in `src/client-message.ts` is compile-checked with `satisfies Record<ClientMessage['method'], ClientReplyMode>`, so a method added to the protocol union but not to the contract table is a build failure. The dispatcher has no such check: `dispatch` in `src/message-handler.ts` is a bare `switch` with no `default` and an `unknown` return type.

So adding a method to the protocol union **and** the contract table while forgetting its `case` compiles cleanly. At runtime the switch falls off the end, `dispatch` returns `undefined`, and `handle` answers the client with a successful `rpc-reply` carrying `'ok'` (for an `ack` method) or `undefined` (for a `result` method). The client sees a success for work that never happened.

## Goal

A method reachable by the contract table with no handler is a **compile error**. If one somehow reaches the dispatcher at runtime anyway, it answers with an RPC error rather than a fake success.

## Design decisions

**Both halves of the dispatcher, because it is one dispatcher.** `dispatch` delegates twenty-one file-navigator methods to `dispatchFileNavigatorMessage` in `src/message-handler-file-navigator.ts`, whose switch has the identical hole and the identical consequence. Fixing only the outer switch would leave the exact defect this item describes reachable through the inner one — the two files are a single dispatcher split for the 200-line limit, not two subsystems. The inner function's parameter is already a narrowed `FileNavigatorMessage`, so its `never` check is against that narrower union, which is what makes it meaningful there.

**One shared helper, exported from `client-message.ts`.** `unhandledClientMethod(message: never): never` lives beside the contract table it backstops, so the compile-time guarantee and the table that grants a method access to the dispatcher are in the same file. Both switches call it from their `default`.

**A `never` parameter, not a `never` assignment.** Passing `message` to a `never` parameter is the same compile-time check as assigning it to a `never` local, but it also gives the runtime a place to throw from, and the throw is what turns a slipped-through method into a visible error rather than a silent `undefined` return.

**Throwing, not replying directly.** `handle` already wraps `dispatch` in `try`/`catch` and turns any throw into `{ t: 'rpc-reply', id, error }`. Throwing therefore reuses the error path every other dispatch failure already takes, and needs no new branch in `handle`.

**The error names the method.** The whole failure mode is "which method did we forget", so the message carries it: `Unhandled client RPC method: <method>`.

**Nothing changes for unknown methods.** `handle` still returns early for a method absent from the contract table, replying nothing at all — that is the guard against a malformed or hostile frame and is unrelated to this fix.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The compile-checked contract table | `CLIENT_METHOD_CONTRACTS` in `src/client-message.ts` |
| The early return for methods with no contract | `clientReplyMode` / `handle` in `src/message-handler.ts` |
| The catch that turns a throw into an error reply | `handle` in `src/message-handler.ts` |
| The error-message formatter | `errorText` in `src/error-text.ts` |
| The narrowed file-navigator message union | `FileNavigatorMessage` in `src/message-handler-file-navigator.ts` |

## Implementation steps

1. **`src/client-message.ts`: add `unhandledClientMethod`.** `export function unhandledClientMethod(message: never): never` throwing `Unhandled client RPC method: <method>`, with a comment saying what the `never` parameter buys: the call only typechecks when every method in the switch's union has a case, so a missing handler fails the build.

2. **`src/message-handler.ts`: add the `default` branch.** `default: { return unhandledClientMethod(message); }` at the end of `dispatch`'s switch.

3. **`src/message-handler-file-navigator.ts`: add the same `default`** to `dispatchFileNavigatorMessage`'s switch.

## Tests

- `src/message-handler-exhaustive.test.ts` (new) — the runtime half, in its own file because it mocks `clientReplyMode` and that mock is file-scoped. A method the contract table admits (`clientReplyMode` returns `'ack'`) but the switch has no case for must answer `{ t: 'rpc-reply', id, error }` naming the method — **not** `result: 'ok'`, which is exactly what today's silent fall-through produces. A second case does the same through a file-navigator-shaped method to cover the inner dispatcher, and a third checks that a real method still answers `'ok'` under the same mock, so the mock is shown not to have broken ordinary dispatch.
- `src/message-handler.test.ts` and `src/message-handler-file-navigator.test.ts` must pass **unchanged** — every handled method still answers exactly as before.

The compile-time half is not a test but the point of the change: deleting any `case` from either switch makes `npm run typecheck` fail, which is the guarantee the item asks for.

## Out of scope

- **`ServerEvent` dispatch on the client**, which has its own structure and its own union.
- **Collapsing the file-navigator case list** in `dispatch` (twenty-one `case` labels falling through to one delegate) into a table. It is a second hand-maintained list of the same names, but the `never` default now catches an omission from it at compile time, which is what this item asks for.
- **Changing any reply mode** in `CLIENT_METHOD_CONTRACTS`.
- **Validating params per method.** Three methods hand-check their params (`pluginIntent`, `pluginFailed`, `editorPluginFailed`); a general params contract is separate work.
