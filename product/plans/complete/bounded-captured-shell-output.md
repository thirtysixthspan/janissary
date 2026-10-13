# Bound captured shell output

## Complexity

6/10. The change replaces two local stream accumulators with one small bounded scanner. It must preserve delimiter handling across chunk boundaries and keep the shell draining after output retention stops.

## Goal

Captured shell command output and `pwd` query state remain bounded even when a command or background process streams indefinitely. Completion markers are still recognized after truncation, and the final truncation note reaches transcript consumers.

## Approach

Add a framework-free accumulator with a concrete 1 Mi-character command-output limit, a rolling suffix for split markers, and a truncation note in progress and final output. Continue consuming stdout and stderr until the delimiter or stream end. Reuse its bounded marker recognition for `queryShellPwd`, while retaining only a bounded candidate path line and the last valid path answer.

## Implementation steps

1. Add the bounded accumulator and bounded last-path reader.
2. Use them in `executeShellCmd` and `queryShellPwd` without changing listener cleanup, trimming, exit notes, or queue serialization.
3. Add tests for oversized chunks, split sentinels after truncation, stderr overflow, exit before sentinel, large background output before a path answer, and transcript capture of the truncation note.
4. Document the retention limit in `product/specs/shell.md` and `product/specs/transcript.md`.

## Tests

- The retained output never exceeds the configured budget, and both progress and final results identify truncation.
- A marker split across chunks after the cap completes once; stdout and stderr both remain drained.
- A query retains the last path answer without keeping unrelated output, even after the marker arrives later.
- An exited shell still completes with `SHELL_EXITED_NOTE`, and the transcript capture path receives the final bounded result.
- Run `./scripts/run.mjs check-diff` after each implementation step.

## Out of scope

- Backpressure or pausing the shell process when output exceeds the retained budget.
- Capturing the omitted output in another file or changing shell command grammar.
