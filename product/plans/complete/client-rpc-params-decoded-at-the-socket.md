# Decode a client RPC's params at the socket, the way remote frames already are

**Complexity: 6/10** — one decoder per method across sixty-six methods, in six domain modules mirroring `src/protocol/`, plus a shared guard module and the tests. Broad but mechanical: the pattern, the completeness idiom, and the shape of each params object all already exist. No wire-protocol change and no dispatcher change.

The codebase runs two ingress boundaries with opposite postures. `decodeKnownFrame` in `src/remote/frame-decode.ts` validates every field of every `RemoteFrame` arm through `nonEmptyString`/`positiveInteger`/`decodeEnv` and returns `{ error }` on a mismatch. `isClientMessage` in `src/client-message.ts` asserts `value is ClientMessage` — a discriminated union whose arms carry fully-typed `params` — while checking only `t === 'rpc'`, a numeric `id`, a method name present in `CLIENT_METHOD_CONTRACTS`, and `params` being a non-array object. `src/index.ts` then hands that object to `handle`, whose `dispatch` reads `message.params.index`, `message.params.cols`, `message.params.url` and the rest at their declared types.

Three of the sixty-six methods are re-checked inside the dispatcher — `pluginIntent`, `pluginFailed`, `editorPluginFailed`, by hand-written guards in `client-message.ts` — and nothing explains why those three and not the rest.

## Goal

Every client RPC's params are decoded field by field at the socket boundary, before the dispatcher reads them, and a method added to the protocol without a decoder is a compile error rather than a method accepted on its name alone.

## Design decisions

**One decoder table per protocol domain, mirroring `src/protocol/`.** The `RpcCall` union is already split into `core-rpc.ts`, `file-navigator.ts`, `editor.ts`, `monitor.ts`, `schedule.ts`, and `plugin.ts` precisely so a feature adding an RPC edits its own file. The decoders follow the same split under `src/client-params/`, so adding an RPC means editing two files in the same two domains rather than appending to one 66-entry list that would blow the 200-line limit on its first read.

**Each domain table is annotated `Record<XRpcCall['method'], ParamsDecoder>`.** That is the `Record<Union, …>` idiom `CLIENT_FRAME_TYPES` (`src/remote/protocol.ts`) and `CAPABILITIES` (`src/plugins/api.ts`) already use, and it does the work in both directions: a method added to a domain's `RpcCall` without a decoder fails the build, and a decoder for a method that domain does not declare fails too. `src/client-params/index.ts` spreads the six and re-checks the union with `satisfies Record<ClientMessage['method'], ParamsDecoder>`, so a whole domain dropped from the spread is caught as well.

**Decoders check declared types, not ranges.** The failure this exists to stop is a field arriving at the wrong *type* — a string where `reportLayout` declares a number. Range rules are the owning code's business and duplicating them here would put two answers in two places. The exceptions are the fields whose declared type *is* a literal union (`dir: -1 | 1`, `dock: 'left' | 'right' | null`, `mode: 'copy' | 'cut'`, `policy`, `details`, `command`), where checking the type means checking membership.

**Unknown extra keys are accepted.** A decoder answers "is every field the dispatcher will read of the right type", not "is this object exactly this shape". Rejecting an extra key would turn a client one version ahead into a client that cannot talk at all, for no safety gain — the dispatcher never reads a key it does not know.

**`Record<string, never>` params accept any object.** Seven methods declare no params (`init`, `toggleCollapse`, `promoteToTerminal`, `closeHarnessLaunch`, `projectFiles`, `editorPersonas`, `closeScheduleLaunch`). Their dispatch arms read nothing, so a shared `noParams` decoder returns true. Written once, with its reason, rather than left as an unexplained gap.

**A params mismatch is answered with a named error; a bad envelope is still dropped.** These are different failures and the spec already treats them differently. `websocket-rpc.md` says an unrecognized envelope is silently dropped, and separately that malformed `pluginIntent`/`pluginFailed` params "receive `Invalid pluginIntent params` or `Invalid pluginFailed params`". Folding the decoder into `isClientMessage` would drop those instead — and since `pluginIntent` is a deferred method, the plugin awaiting its reply would hang until the socket closed rather than see an error. So `isClientMessage` keeps its envelope-only check, and `src/index.ts` answers a params mismatch with `Invalid <method> params`, generalizing to all sixty-six methods the treatment three of them already had. Every drop case `src/index.test.ts` pins is envelope-level, so it keeps passing unchanged.

**`clientParamsValid` takes `unknown`.** It re-checks `isRecord` itself rather than making the caller cast `ClientMessage['params']` — the union of sixty-six params types — down to `Record<string, unknown>`.

**The three existing guards move rather than being deleted, and the dispatcher keeps calling them.** `isPluginIntentParams` and `isPluginFailedParams` move to `src/client-params/plugin.ts`, `isEditorPluginFailedParams` to `src/client-params/editor.ts`, and each becomes its own method's decoder. `client-message.ts` re-exports all three, so `src/message-handler.ts`'s import line and its defensive re-checks are untouched and its tests keep passing. The inconsistency the item names is fixed by giving the other sixty-three a decoder, not by removing these three.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The field-by-field decoding model | `decodeKnownFrame`, `src/remote/frame-decode.ts` |
| The `Record<Union, …>` completeness idiom | `CLIENT_FRAME_TYPES` (`src/remote/protocol.ts`), `CAPABILITIES` (`src/plugins/api.ts`), `CLIENT_METHOD_CONTRACTS` (`src/client-message.ts`) |
| The per-domain RPC split the decoders mirror | `src/protocol/*.ts` |
| The three guards that become decoders | `src/client-message.ts:87`–`:111` |
| The single call site the check runs from | `isClientMessage`, `src/client-message.ts:122` |
| The drop-on-failure path | `src/index.ts:119` |

## Implementation steps

1. **`src/client-params/guards.ts`.** Export `ParamsDecoder` (`(params: Record<string, unknown>) => boolean`), `isRecord`, `isString`, `isFiniteNumber`, `isInteger`, `isBoolean`, `isStringArray`, `optionalString`, `optionalBoolean`, `isOneOf`, `optionalOneOf`, and `noParams`. These are the `nonEmptyString`/`positiveInteger` equivalents for this boundary.

2. **`src/client-params/core.ts`.** `CORE_PARAMS: Record<CoreRpcCall['method'], ParamsDecoder>` — twenty-nine entries. `reportLayout` uses `isFiniteNumber` (its values are fractional pixels and a percentage, not integers); `openAcpTranscript` gets a local `isAcpRef` covering the three `AcpRef` arms.

3. **`src/client-params/file-navigator.ts`.** `FILE_NAVIGATOR_PARAMS` — twenty-three entries, most `index` plus a path or a path list, with `policy`, `mode`, and `details` checked against their literal unions and `overwrite`/`skipConflicts`/`all`/`sourceHost`/`path` as optionals.

4. **`src/client-params/editor.ts`.** `EDITOR_PARAMS` — seven entries, plus `isEditorPluginFailedParams` moved here and used as `editorPluginFailed`'s decoder.

5. **`src/client-params/monitor.ts`, `schedule.ts`, `plugin.ts`.** Four, one, and two entries; the two plugin guards move into `plugin.ts` and become their own decoders.

6. **`src/client-params/index.ts`.** Spread the six into `CLIENT_PARAMS_DECODERS`, `satisfies Record<ClientMessage['method'], ParamsDecoder>`, and export `clientParamsValid(method, params)`.

7. **`src/client-message.ts`.** Drop the local `isRecord` and the three guards in favour of imports from the new modules, re-export the three so `message-handler.ts` is unaffected, and add `clientParamsProblem(message)` returning `Invalid <method> params` or `undefined`. `isClientMessage` keeps its envelope-only check.

8. **`src/index.ts`.** After `isClientMessage` passes, answer a `clientParamsProblem` with an `rpc-reply` carrying the request id and that error, and return without dispatching.

## Tests

- **`src/client-params/index.test.ts`** (new) — the table has exactly one decoder per method in `CLIENT_METHOD_CONTRACTS` and no extras; `noParams` methods accept any object; a representative accept/reject pair for each of the four methods whose params outlive the call (`reportLayout`, `saveFile`, `editorSync`, `renameTab`); the literal-union fields reject a value outside their union; an extra unknown key is accepted.
- **`src/client-params/core.test.ts`, `file-navigator.test.ts`, `editor.test.ts`** (new) — a wrong-type rejection per field for every method in those three domains, driven off a table of `[method, valid, invalid[]]` so each entry is one row rather than one test.
- **`src/client-message.test.ts`** — the existing accept and envelope-reject cases keep passing unchanged (each already supplies well-typed params); new cases assert `clientParamsProblem` names the method for malformed params and returns `undefined` for good ones, including the `reportLayout`-carrying-a-string case from the item.
- **`src/index.test.ts`** — its existing drop case passes unchanged (every envelope it rejects is envelope-level); one new case asserts a well-formed envelope with a mistyped field is answered with `Invalid <method> params` over the socket rather than dispatched.
- **`src/message-handler.test.ts`, `src/message-handler-exhaustive.test.ts`** must pass **unchanged** — both call `handle` directly and never cross this boundary.

## Out of scope

- **Changing how an unrecognized envelope is handled.** A bad `t`, a non-numeric `id`, an unknown method, or a non-object `params` is still silently dropped.
- **Removing the dispatcher's three defensive re-checks.** They are now redundant, but deleting them moves `message-handler.ts` and its tests in the same change as the boundary.
- **Range or semantic validation** — a negative tab index, a `cols` of zero, a path escaping a root. Those belong to the code that owns each meaning.
- **The server → client direction.** `ServerEvent` is produced by this process, not received from an untrusted peer.
- **Generating the decoders from the types.** No such generator exists here, and adding one is a much larger piece of work than the table it would replace.
