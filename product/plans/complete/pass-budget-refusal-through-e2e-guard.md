# Pass the restart budget's refusal through the e2e guard

**Complexity: 3/10** — one small error type, a one-line change to the guard's catch, and the throw that uses it. The only care needed is keeping the pass-through an allowlist, so the path leak the fixed phrase closed does not reopen.

## Summary

The guard's `bridge` closes every client whose supplier rejects with the one fixed phrase `e2e browser failed to start`. So the `e2e browser will not be restarted` rejection that `ensureUpstream` throws once the restart budget is spent never reaches the client. The harness spec, the installed-runtime guidelines, the `WILL_NOT_RESTART` comment and the pull request's verification step all say the client is told exactly that phrase. An agent refused by the budget reads "failed to start" instead, follows the guidelines' advice that "a later connect simply tries again", and retries against a tab that will never be given a browser.

## Design decisions

1. **A typed refusal, not a message match.** The guard cannot tell a guard-authored phrase from filesystem or spawn text by reading it, so the supplier says which kind of rejection it is. A small `E2EClientRefusal` error class marks a rejection whose message is fit for the confined client, and the guard closes with that message when the rejection is one. Every other rejection still collapses to `BROWSER_DID_NOT_START`.

2. **The allowlist is in the type.** The class's constructor takes a `ClientRefusalReason`, a union of phrase literals owned by the same module, rather than any string. The budget refusal's phrase moves there from `e2e-server.ts`. A caller cannot hand an `errorText(error)` to it without the typechecker refusing, so opening the pass-through to a new phrase is a deliberate edit to that union.

3. **Its own module, not `e2e-guard.ts`.** The server suites mock `./e2e-guard.js` with `startE2EGuard` alone. A class imported from there would be `undefined` inside them, and every refusal would throw a `TypeError` instead. A module both the guard and the server import directly stays real in every suite without widening the mock.

4. **The closed-tab throw stays generic.** `e2e browser is no longer available` is thrown only after `handle.close()`, which has already stopped the guard and terminated its clients, so no client can be waiting on it. Leaving it generic keeps the allowlist to the one phrase a client can actually receive.

## Proposed changes

1. **`src/browser/e2e-refusal.ts` (new).** Exports `WILL_NOT_RESTART`, the `ClientRefusalReason` union, and `E2EClientRefusal`, with a comment saying why the pass-through is an allowlist.

2. **`src/browser/e2e-guard.ts`.** `bridge`'s catch closes with the refusal's message when the rejection is an `E2EClientRefusal`, and with `BROWSER_DID_NOT_START` otherwise. The `ensureUpstream` option comment and the fixed-phrase comment say which rejections pass through.

3. **`src/browser/e2e-server.ts`.** The budget check throws `new E2EClientRefusal(WILL_NOT_RESTART)` and imports the phrase from the new module instead of declaring it. `startBrowser`'s rethrow of filesystem and spawn errors is untouched.

4. **`src/browser/e2e-ready.ts`.** The `waitForListening` doc comment stops saying its rejection "turns it into a close reason the client is given". It turns it into the report the human reads, and the client is closed with the fixed phrase.

## Tests

- `src/browser/e2e-guard.test.ts`: a supplier that rejects with `new E2EClientRefusal(WILL_NOT_RESTART)` closes the client with code 1008 and the reason `e2e browser will not be restarted`, and nothing reaches the upstream. The existing "closes the client with a fixed phrase" and "keeps a filesystem path out of the reason" cases keep passing unchanged.
- `src/browser/e2e-server-lazy.test.ts`: in the budget block, the rejection after three failed starts is an `E2EClientRefusal` carrying the refusal phrase. The suite mocks the guard, so the end-to-end reason is pinned by the guard suite.

## Out of scope

- No spec, guideline or user-documentation edit. They already describe the intended behavior.
- No change to the restart budget itself, to what counts against it, or to the reports it sends.

## Verification

`./scripts/run.mjs check-diff`.
