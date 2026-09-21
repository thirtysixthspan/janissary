# Clear a session row's terminating marker on every way the terminate attempt can end

**Complexity: 5/10** — a rejection arm plus a small responsibility move, contained to
`src/sessions/actions.ts` and one new colocated test file. It mirrors a pattern (`attach`'s two-arm
`.then`) already in the same file, so there is no new design, only applying an existing one to a
sibling function and centralizing where the marker's clear happens.

`terminate` in `src/sessions/actions.ts` raises `terminating` synchronously and calls
`void terminateParkedSession(managers, record).then((outcome) => { … apply({ terminatingDone, … }) })`
with only a fulfillment handler. `attach`, directly above it in the same file, passes both arms to
`.then` via its `failed` helper. The rejection is reachable, not theoretical:
`terminateParkedSession` in `src/sessions/terminate-session.ts` runs `managers.remote.create(...)`
synchronously inside a `new Promise` executor, and a `create` that throws (`spawnPty`'s `pty.spawn`
can throw synchronously on a spawn failure, reached through `connect` → `spawnTransport`) rejects that
promise — with nothing today catching it, which leaves the row's `terminating` flag set for the life
of the process: no attach control, no terminate control, no failure line, while the parked workspace
it claims to be removing is still sitting on the far host.

## Goal

A terminate attempt's promise rejecting is treated exactly like it resolving with
`{ terminated: false, reason }`: the row's `terminating` marker clears, a failure reason lands on the
row, and one notification line reports it — matching what `attach`'s rejection arm already does.
Additionally, the raise/clear pairing moves out of `terminate` itself and into `runSessionAction`, so
the invariant ("a raised marker always gets a matching clear") is enforced structurally at the one
place every action result passes through, rather than repeated by hand inside `terminate`.

## Approach

1. **`terminate` stops calling `apply` itself.** It returns `{ result: SessionActionResult; attempt:
   Promise<SessionActionResult> }` instead of taking an `apply` parameter: `result` is the immediate
   `{ ran: true, terminating: record.session }`, and `attempt` is `terminateParkedSession(...)` mapped
   — via `.then(onFulfilled, onRejected)`, mirroring `attach`'s `failed` helper — to the
   `SessionActionResult` the settle should apply (the terminated-drop shape on success, a
   `failure: { session, reason }` shape on either a resolved-false outcome or a rejection). Neither
   arm sets `terminatingDone` itself — that is `runSessionAction`'s job, not the action's.
2. **`runSessionAction`'s terminate branch wires the pairing.** Where it currently returns
   `terminateLive(managers, record) ?? terminate(managers, record, apply)`, it instead: checks
   `terminateLive` first as before; otherwise calls `terminate(managers, record)`, attaches
   `void attempt.then((settled) => apply({ ...settled, terminatingDone: record.session }))`, and
   returns `result`. This is the one place a `terminating` raise and its clear are now paired, so a
   future action that raises `terminating` without also handing back an `attempt` simply never clears
   it — a mistake this shape makes visible rather than silent.
3. **The rejection's report line mirrors `attach`'s wording**: `line(record.launchLabel, record.host,
   \`could not be terminated: ${reason}\`)`, using `errorText` from `src/error-text.ts` exactly as
   `attach`'s `failed` helper does.
4. **New test file `src/sessions/actions.test.ts`.** `actions.ts` has no colocated test today;
   `manager.test.ts` exercises it only indirectly through `SessionsManager`. Add a direct suite for
   `runSessionAction`'s terminate branch, mocking `./terminate-session.js`'s `terminateParkedSession`
   and `../notifications.js`'s `notify` the same way `manager.test.ts` already does, with a minimal
   local `Managers` fake (`tab.cur()`, `tab.tabs`) rather than reusing that file's fuller harness.

## Implementation steps

1. `src/sessions/actions.ts`: change `terminate`'s signature and body per the approach above; update `runSessionAction`'s terminate branch to wire `attempt` to `apply`.
2. `src/sessions/actions.test.ts` (new): cover both settle arms — the fulfilled-terminated case, the fulfilled-not-terminated case, and the new rejection case — asserting `apply` receives `terminatingDone: record.session` on every one, and that the rejection case's notification line reads "could not be terminated: <reason>".
3. Run `check-diff` after each step.

## Tests

- `src/sessions/actions.test.ts` (new) — `runSessionAction` with `{ kind: 'terminate', session }`:
  - resolves `{ terminated: true }`: `apply` is called with `drop`, `clearFailure`, `terminatingDone`, and `terminated` all set to/for the record's session; the synchronous return is `{ ran: true, terminating: record.session }`.
  - resolves `{ terminated: false, reason }`: `apply` is called with `failure: { session, reason }` and `terminatingDone: record.session`.
  - rejects with an `Error`: `apply` is called with `failure: { session, reason: errorText(error) }` and `terminatingDone: record.session`, and `notify` is called once with a line containing "could not be terminated".
- `src/sessions/manager.test.ts` must keep passing unchanged — in particular "keeps the row on screen, marked ending, while the attempt is unresolved" (pins the synchronous `terminating: true` row before the promise settles) and "keeps the record when the host could not be reached" (pins the resolved-false failure path). Neither test's mock setup changes; only `actions.ts`'s internals move.

## Out of scope

- Applying the same "hand back an attempt promise" restructuring to `attach` — its own rejection
  handling already works today (`failed` is called from both `.then` arms already), so there is
  nothing broken there to fix, and generalizing the pairing mechanism further than `terminate` needs
  is not what this item asks for.
- Any change to `terminate-session.ts` itself, or to the wire protocol / `RemoteSessionAction` type.
