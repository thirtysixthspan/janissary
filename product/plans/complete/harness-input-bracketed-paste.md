# Frame machine-typed harness input as a bracketed paste for codex

**Complexity: 3/10** — one shared delivery helper, two call sites re-pointed at it, tests, and two spec sentences. No wiring, protocol, or storage changes.

## Bug

`scheduled commands into codex dont cause codex to execute the command although the command is pasted into the harness with a carriage return leaving a multi-line entry awaiting a manual carriage return` — named in the task invocation, not listed in `./product/backlog/bugs.md`.

## Root cause

Codex's composer (codex-rs `bottom_pane/paste_burst.rs`, present in the installed 0.153.0 and current main) classifies a rapid multi-character write as a *paste burst*: three or more plain characters arriving within 8ms of each other are buffered and re-inserted as one explicit paste, and any Enter within **120ms of the last burst character is suppressed — it inserts a newline instead of submitting** (`newline_should_insert_instead_of_submit`). The suppression window is measured from the last burst character, so for a long command it outlasts any fixed delay.

Janissary types scheduled commands and `send` text into a harness PTY as one burst write. Delivered as `command + '\r'` in a single write, the trailing `\r` lands inside the burst and is consumed as paste content, leaving the command sitting in the composer — exactly the reported symptom. Delivered as text followed by a separately delayed `\r` (the current split at `src/schedule/manager.ts:193-194` and `src/commands/send.ts:23-24`), the `\r` lands 50ms later, which is still inside codex's 120ms suppression window whenever the burst is classified — and the window scales with command length, so no fixed delay is safe.

## Replication (observed)

A throwaway driver (`temp/repro-codex.mjs`) spawned codex 0.153.0 in a PTY via node-pty and replayed the exact write sequence the delivery path produces:

- One write of `say ready and nothing else\r` → codex's composer still holds `› say ready and nothing else` after the observation window; no turn starts. This is the reported failure, replicated.
- Text write + `\r` after 50ms → submitted on this machine, but only because codex's event processing happened to be slow enough that the burst was never classified; the state machine inserts a newline whenever it is classified, so this is timing-dependent, not a fix.
- Text framed as `ESC[200~ … ESC[201~` (bracketed paste) + `\r` after 50ms → submitted, deterministically, including with a ~300-character command. Codex enables bracketed paste mode (`ESC[?2004h` in its startup output) and routes a framed paste through its explicit-paste path, which clears the burst state entirely, so the following Enter always submits.

## Correct behavior

A command delivered to a running codex harness — by a schedule firing or by `send` — is executed by codex without a manual Enter, regardless of the command's length. It is presented the way a terminal presents a paste: framed with bracketed-paste markers, followed by a separately delayed Enter. Harnesses without this behavior (claude, opencode, ssh tabs running arbitrary remote programs) keep today's delivery unchanged: the text as one write, then the delayed Enter.

## Approach

1. **One shared delivery helper** — `typeIntoHarness(pty, ptyId, name, text)` in a new `src/harness/input.ts`. Both delivery sites duplicate the same two lines today; the helper becomes the single place that knows the shape. A per-name set (`PASTE_FRAME_NAMES`) decides framing: codex's write is wrapped in `ESC[200~ … ESC[201~`; everything else is written plain. The Enter is a separate delayed write in both branches, unchanged.
2. **`src/schedule/manager.ts` `fire()`** — harness branch calls the helper with `tab.harness.name`; the one-entry-per-tick budget and the notification are untouched.
3. **`src/commands/send.ts` `deliverTo()`** — harness branch calls the helper with `target.harness.name`; the running check and error strings are untouched.
4. **SSH and unknown harnesses keep the plain path** — a remote session may run programs that do not read bracketed paste, and wrapping would corrupt their input; the named set is opt-in per harness.

## Implementation steps

1. Add `src/harness/input.ts` with the helper and its framing constant; add `src/harness/input.test.ts` covering both branches (framed write + delayed Enter for codex, plain write + delayed Enter otherwise).
2. Re-point `src/schedule/manager.ts` `fire()` at the helper.
3. Re-point `src/commands/send.ts` `deliverTo()` at the helper.
4. Extend `src/schedule/manager.test.ts` with a codex-harness delivery case (framed text, then `\r` after 50ms) beside the existing claude cases; extend `src/commands/send.test.ts` with a delivery case asserting the framed write for a codex target.
5. `./scripts/run.mjs check-diff` after each step.

## Regression test

`src/harness/input.test.ts` asserts codex delivery writes `ESC[200~<text>ESC[201~` first and `\r` after the 50ms delay, and that other harnesses keep the plain shape — these fail against the unfixed call sites' inline two-line behavior. `src/schedule/manager.test.ts`'s new codex case fails without the fix (plain text instead of the framed write) and passes with it; the existing claude cases prove the plain path is unchanged. The real-PTY replication above was observed against the live codex 0.153.0 before the fix.

## Verification

- New and existing schedule/send/helper tests green under `check-diff`.
- Manual: the replication driver's framed shape submitted in codex 0.153.0 (observed pre-fix); the codex-framed unit path is what the driver exercised.

## Out of scope

- Bracketing delivery for claude or opencode (both work today; changing them is churn without a bug).
- Tracking bracketed-paste mode from each PTY's output stream (the fully mode-aware terminal behavior) — the per-name set covers the one harness that needs it without intercepting output.
- Remote PTY output framing — the bytes reach the far-side PTY unchanged, so a remote codex benefits identically.
