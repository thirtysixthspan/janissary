# Pass notify's optional link targets and detection time by name

**Complexity: 2/10** — one signature change in `src/notifications/index.ts`, four production callers, and the test expectations that assert the trailing arguments. No behavior changes.

`notify(managers, event, tabLabel, message?, openFile?, openTab?, detectedAt?)` grew one trailing positional parameter per capability. A caller that needs only `openTab` or `detectedAt` spells out every `undefined` before it, and `openFile` and `openTab` are adjacent optional strings, so transposing them typechecks and ships a notification whose click opens the wrong thing.

## Goal

`notify(managers, event, tabLabel, message?, options?)`, where `options` is a named `NotifyOptions` record `{ openFile?: string; openTab?: string; detectedAt?: Date }`. A transposed or misspelled option is a compile error. A supplied `detectedAt` still dates the feed line and suppresses the toast.

## Approach

1. **`src/notifications/index.ts`**: export `interface NotifyOptions` with the three fields (the `detectedAt` rationale comment moves onto its field), and replace the three trailing parameters with a destructured `{ openFile, openTab, detectedAt }: NotifyOptions = {}`. The body is unchanged.
2. **Callers** (found by the typechecker after the signature change, matching the backlog entry's list exactly):
   - `src/controller/create-managers.ts`: the `question` notification passes `{ openTab: label }`.
   - `src/remote/pty-session.ts`: `{ openFile, detectedAt: replayed ? new Date(capturedAt) : undefined }`.
   - `src/harness/auto-approve-wire.ts`: `{ openFile }`.
   - `src/harness/browser-gone.ts`: `{ openFile: logFile }`.

Rejected: folding `message` into the options record too. It is the common fourth argument at nearly every call site, so keeping it positional leaves those sites untouched.

## Implementation steps

1. Change the signature and add `NotifyOptions`.
2. Update the four callers; `./scripts/run.mjs check-diff`.
3. Update the test expectations that assert the trailing arguments; `./scripts/run.mjs check-diff`.

## Tests

- `src/notifications/index.test.ts`: the `detectedAt`, `openFile`, `openTab`, and replayed-notification cases pass their option by name. Add a case that a notification given only `detectedAt` (no link) still carries neither link on the entry.
- `src/remote/pty-session.test.ts`: live gate events expect `{ openFile, detectedAt: undefined }`; the replayed one expects `detectedAt` set to the original detection time.
- `src/harness/manager.test.ts` and `src/harness/manager-browser.test.ts`: auto-approve and browser-gone notifications expect `{ openFile }`.

## Spec

None needed: no user-visible behavior changes.

## Out of scope

- The other `notify` callers, which pass at most a message and are unaffected.
- Any change to how the feed or toasts render a notification.
