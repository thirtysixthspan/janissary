# Strip shell sentinels from restored remote agent output

**Complexity: 3/10** — one pure stripping function, one call site where restored output lands in the tab log, plus tests and spec wording.

## Goal

When a remote agent tab is reattached, the transcript shown in the new tab must not contain the shell's internal `__`-delimited sentinels (`__JS_END_<n>_<ts>__`, `__PWD_<n>_<ts>__`) or the stray `pwd` line the sentinel queries emit. A normal agent tab never renders them because live command output is stripped by `executeShellCmd`/`queryShellPwd` before it reaches the transcript; the restore path bypasses that and appends the raw recorded stream.

## Approach

The restored-output path (`ShellManager.appendRestoredOutput` in `src/shell/manager.ts`) currently forwards replayed bytes verbatim into `tab.log`. Live output never shows sentinels because `executeShellCmd` (`src/shell/index.ts`) slices the buffer at the sentinel and `queryShellPwd` does the same. Replay history on the remote (`ReplayHistory` in `src/remote/replay-history.ts`) records raw `output` frames that still carry the sentinel echo lines, so the restored transcript shows them.

Fix at the point restored bytes enter the tab log: add a pure `stripShellSentinels` function in `src/shell/sentinel-strip.ts` that removes sentinel lines and their surrounding query debris (`pwd`, the cwd line before a `__PWD_` marker, empty lines left behind), and call it from `appendRestoredOutput`. Keep it line-based and idempotent so a marker split across replayed chunks is still removed as a whole line, matching how the markers actually appear (each on its own line, as the shell's `echo` emits them).

What is stripped: any line matching `__JS_END_<digits>_<digits>__` or `__PWD_<digits>_<digits>__` (full-line match, possibly with surrounding whitespace); a bare `pwd` line immediately preceding a `__PWD_` sentinel line; a non-empty path-looking line immediately preceding a `__PWD_` sentinel line (the cwd answer the `pwd` command printed); and lines that become empty as a result, except when the whole output would become empty (then keep a single empty string so callers see no-op behavior unchanged). Pure function: no bus, no tab access — trivially unit-testable, per the parse-pure/execute-effectful seam.

Not stripped: `__JS_SEED_<uuid>__` PTY seed markers (never reach a pipe shell's transcript) and any sentinel embedded mid-line rather than on its own line (the shell always echoes them on their own lines via `echo "…"`; the live path's `indexOf` slicing covers that contract).

## Implementation steps

1. Create `src/shell/sentinel-strip.ts` exporting `stripShellSentinels(data: string): string`, pure, line-based, implementing the rules above.
2. Call it in `ShellManager.appendRestoredOutput` (`src/shell/manager.ts`) after the terminal-reset trim, before the empty check and append.
3. Check `src/shell/manager.ts` against the 200-line limit after the edit; extract if needed (it is heavily commented, so raw-line count matters more than file length).

## Tests

- `src/shell/sentinel-strip.test.ts` (new) — unit tests: removes `__JS_END_…__` and `__PWD_…__` lines; removes the `pwd` line and the cwd line paired with a `__PWD_` marker; leaves ordinary output untouched (including text containing `__` that is not a sentinel); handles markers split across chunks (each call sees whole lines eventually — test the per-call contract: a partial trailing line is left alone); idempotent.
- `src/shell/manager.test.ts` — extend the restored-output test (the "publishes restored output immediately" block) with restored data carrying `__JS_END_3_…__`, `__PWD_3_…__`, `pwd`, and cwd lines, asserting the tab log holds none of them.

## Spec updates

- `product/specs/remote-server.md` — in the agent-reattach paragraph (~line 255), state that restored shell output appears without the internal sentinel lines that live command execution strips.
- `product/specs/sessions-tab.md` (~line 82) — same one-line clarification for the sessions-tab wording.

## Docs

- `documentation/user-documentation/advanced-agents/remote-agents.md` (~line 116) — no update needed unless wording contradicts; the fix changes no user-visible contract beyond removing artifacts that were never documented. Check in Step 6; likely "none needed".

## Out of scope

- The web UI transcript renderer (no client-side filtering; the server is the source of truth).
- Replay history retention, truncation notices, or the harness terminal replay path (harness output is a PTY screen, not sentinel-delimited text).
- Filtering sentinels mid-line or `__JS_SEED_…__` markers.
