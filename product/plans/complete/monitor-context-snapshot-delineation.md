# Feature: delineate model input from model response in a monitor context snapshot

**Complexity: 3/10** — a small, self-contained change on the server. The monitor context snapshot already accumulates every block of the monitor agent's ACP conversation, but joins them with blank lines and no labels, so a reader cannot tell which blocks were fed to the model (persona priming, batched updates, direct questions) from which are the model's own replies. Tag each recorded block with a direction and render a labeled header before it when snapshotting. No new data flow, no client changes.

## Goal

When a monitor's context snapshot opens (the context button on an external monitor's reporting-tab metadata line), each block is preceded by a header that states whether it was sent to the model or received from it. A reader scrolling the snapshot can immediately see the boundary between prompt and reply, rather than a wall of blank-line-separated text where the two are indistinguishable.

## Approach

`recordContext(reg, text)` currently pushes a bare string onto `reg.contextText: string[]`. Give each recorded block a direction:

- `contextText` becomes `MonitorContextEntry[]`, where `MonitorContextEntry = { role: 'input' | 'response'; text: string }`.
- `recordContext(reg, text, role)` takes the direction as a third argument.
- The three input sites pass `'input'`: persona priming (`session.ts`), the batched update prompt (`manager.ts` `flush`), and the direct question (`ask.ts`).
- The one response site passes `'response'`: the completed reply (`reply.ts`).

`snapshotMonitorContext` maps each entry to `"<header>\n<text>"` and joins with blank lines, where the header is a clearly-delineated label — `━━━ SENT TO MODEL ━━━` for `input` and `━━━ MODEL RESPONSE ━━━` for `response`. The byte accounting (`contextBytes`) is unchanged: it still counts only the block text, not the headers, so the counter on the metadata line keeps measuring the true context size.

## Implementation steps

1. `src/monitor/context.ts`: add and export `MonitorContextEntry`; add a `role` parameter to `recordContext`; render per-block headers in `snapshotMonitorContext`.
2. `src/monitor/manager.ts`: type `contextText` as `MonitorContextEntry[]`.
3. Pass the direction at the four call sites: `'input'` in `session.ts`, `manager.ts` `flush`, and `ask.ts`; `'response'` in `reply.ts`.
4. Update the mock type in `src/monitor/ask.test.ts` (`contextText: [] as string[]` → `MonitorContextEntry[]`).
5. Run `./scripts/run.mjs check-diff` after each chunk.

## Tests

- **`src/monitor/manager.test.ts`**: extend the existing `snapshotContext` test to assert the captured text contains both the `SENT TO MODEL` and `MODEL RESPONSE` headers, and that the persona priming and flushed update appear under a `SENT TO MODEL` header while the reply appears under a `MODEL RESPONSE` header.

## Out of scope

- Distinguishing the three kinds of input from one another (priming vs. update vs. ask) — the issue is only about model-input vs. model-response.
- Any client/UI change — the snapshot still opens in the same editor tab; only the file contents gain headers.
- Changing what `contextBytes` counts or how the metadata line renders.

## Verification

- `./scripts/run.mjs check-diff` passes.
- Manual: start an external monitor, let it prime and flush, click the context button, and confirm the opened editor tab shows `SENT TO MODEL` / `MODEL RESPONSE` headers separating the blocks. Not runnable headless here; covered by the server snapshot test.
