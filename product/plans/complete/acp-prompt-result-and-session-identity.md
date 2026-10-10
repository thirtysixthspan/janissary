# Tell a summarizer refusal apart from a summarizer reply

**Complexity: 6/10** — one outcome type through the ACP layer, one session identity minted per session, one new plugin capability, and four scenarios that all currently resolve as success.

`promptAcp` resolves with a string, and core resolves a *refused* prompt with a string too: `Tab not found`, `ACP: a prompt is already running.`, `ACP: the remote session is still connecting.`, `ACP: no opencode model is available in the harness catalog.`, and `ACP error: <message>` from the tool loop's own error path. The launcher's `summarizeOnce` in `src/plugins/launcher/summarizer.ts` takes whatever it resolves with as the model's answer, advances every cursor, and reports the line to the notifications feed as though it were a failure it had caught — which it does only because the string happens to throw. Nothing distinguishes them but the text, so a refusal is indistinguishable from a tab the persona had nothing to say about.

The second half of the entry is the same blindness one layer up: `state.primed` is a boolean set on the first successful priming and never revisited. A tab's session is replaced whenever the old one dies — a fatal connection error closes and forgets it — and the successor arrives with no persona body, no reply format, and none of the session's trust framing, because the delimiter the framing names is the dead session's. The next prompt is a cold session asked for `[[tab:<label>]] <paragraph>` blocks it has never been told the shape of.

## Goal

A flush can tell a reply from a refusal without reading its text, and re-primes — with a new delimiter — when the session it is talking to is not the one it primed.

## Approach

1. **`src/acp/types.ts`** gains `AcpPromptResult`, a two-member result: `{ answered: true, reply, session }` or `{ answered: false, error }`. It is the answer rather than a string, because the two cases arrive through the same resolved promise today.
2. **`src/acp/manager.ts`** makes `run`'s completion carry it. Every path that previously resolved `onDone` with a line of prose says which kind of line it was: the tool loop's `finished` handler is an answer, its `error` handler and the three refusals are not. `prompt` keeps its string API and maps the result onto it, so `src/commands/acp.ts` and the shell are untouched; `promptResult` is the new entry point.
3. **`src/acp/session-manager.ts`** mints a per-tab session identity each time it creates a session, forgets it on close, and exposes it. `start` returns it beside the model, so a caller learns which session it is talking to before it prompts.
4. **`src/plugins/api.ts`** publishes `promptAcpResult(prompt)` as a new capability and adds `session` to `startAcp`'s answer. Both additive; the ordinary string API stays exactly as it is for callers that depend on it.
5. **`src/plugins/launcher/summarizer.ts`** prompts through `promptAcpResult`, throws on a refusal — which leaves every cursor where it was, so the next flush asks again — and re-primes when the session identity is not the one it primed.

### Rejected alternatives

- Recognizing refusal strings by prefix. That is the guess the entry exists to remove, and it silently mis-reads a persona that legitimately opens its reply with `ACP error:`.
- Returning `string | null` and treating null as failure. A refusal's text is what the notifications feed shows the user, so the failure case has to carry it.
- Letting the summarizer reset its state on any error rather than on an identity change. A prompt-level error leaves a viable session, and re-priming it would throw away a good conversation and mint a delimiter nobody needs.

## Implementation steps

1. Add `AcpPromptResult` to `src/acp/types.ts`.
2. Mint and expose the session identity in `src/acp/session-manager.ts`.
3. Make `run`, `prompt`, and `promptResult` outcome-aware in `src/acp/manager.ts`.
4. Publish the capability and the `startAcp` session field in `src/plugins/api.ts`, name it in `api-capabilities.ts`, and implement it in `acp-capabilities.ts`.
5. Declare it in the launcher's manifest and re-prime on an identity change in `summarizer.ts`.
6. Update the tests below and run `./scripts/run.mjs check-diff`.

## Tests

- `src/acp/manager.test.ts`: the run's completion now carries the result, so `onDone` receives `{ answered: true, reply }` from a finished turn and `{ answered: false, error }` from the error handler and from each refusal; `prompt` still resolves with the text alone.
- `src/acp/plugin-session.test.ts`: through the plugin capability object, a normal reply answers with the reply and the session identity, the loop's `error` handler answers with a refusal and no reply, and closing the session between two prompts changes the identity the second one reports.
- `src/plugins/launcher/summarizer.test.ts`: a prompt the core refuses advances no cursor and rethrows; a connection close between flushes re-primes with a fresh delimiter; an answered-but-empty reply resolves and publishes nothing; and a flush that failed is retried on the next one without the tab producing any further output.

## Spec updates

- `product/specs/acp.md`: `startAcp` reports the session it began or reused, `promptAcpResult` answers with a result rather than a string, and a caller can tell a refusal from a reply without reading its text.
- `product/specs/launcher.md`: a refused prompt is reported and retried rather than being believed an answer, and a replaced session is re-primed.
- `documentation/developer-documentation/tab-plugins.md`: the new capability's bullet, the count, the "Using core ACP" section, and the v2 changelog line.

## Out of scope

- Changing what the ordinary `acp` command, the shell tab, or the monitor/conversation/editor consumers do. They keep the string API.
- Aborting a prompt in flight when the summarizer's intent is abandoned.
