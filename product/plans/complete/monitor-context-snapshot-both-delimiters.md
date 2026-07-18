# Monitor context snapshot: delimiters both before and after each block

**Complexity: 3/10** — one data-shape change (a single header string becomes a begin/end pair) confined to `src/monitor/context.ts`, plus updating the one existing test's expectations and adding new ones. No protocol, wire-type, or UI change.

## Goal

The monitor's context snapshot (opened via the monitor tab's context button, see `product/specs/monitoring.md:17`) writes each accumulated block — persona priming, batched updates, direct questions, and replies — under a single header line marking its direction ("SENT TO MODEL" / "MODEL RESPONSE"), with **no marker after the block's content**. Per the backlog, delimiters should appear **both before and after** the content they delimit, e.g.:

```
━━━━━━━━━━ SENT TO MODEL BEGIN ━━━━━━━━━━
text
━━━━━━━━━━ SENT TO MODEL END ━━━━━━━━━━
━━━━━━━━━━ MODEL RESPONSE BEGIN ━━━━━━━━━━
ok
━━━━━━━━━━ MODEL RESPONSE END ━━━━━━━━━━
```

## Approach

`src/monitor/context.ts`'s `HEADERS` constant currently maps each `MonitorContextEntry['role']` to one header string, and `snapshotMonitorContext` joins `${HEADERS[role]}\n${text}` per block. Change `HEADERS` to map each role to a `{ begin, end }` pair (appending " BEGIN " / " END " into the existing banner style, keeping the same `━━━━━━━━━━` box-drawing border), and change the join to wrap each block's text between its role's `begin` and `end` markers.

## Implementation steps

1. **`src/monitor/context.ts`** — change:
   ```ts
   const HEADERS: Record<MonitorContextEntry['role'], string> = {
     input: '━━━━━━━━━━ SENT TO MODEL ━━━━━━━━━━',
     response: '━━━━━━━━━━ MODEL RESPONSE ━━━━━━━━━━',
   };
   ```
   to:
   ```ts
   const HEADERS: Record<MonitorContextEntry['role'], { begin: string; end: string }> = {
     input: { begin: '━━━━━━━━━━ SENT TO MODEL BEGIN ━━━━━━━━━━', end: '━━━━━━━━━━ SENT TO MODEL END ━━━━━━━━━━' },
     response: { begin: '━━━━━━━━━━ MODEL RESPONSE BEGIN ━━━━━━━━━━', end: '━━━━━━━━━━ MODEL RESPONSE END ━━━━━━━━━━' },
   };
   ```
2. **`src/monitor/context.ts`, `snapshotMonitorContext`** — change:
   ```ts
   const body = reg.contextText.map(({ role, text }) => `${HEADERS[role]}\n${text}`).join('\n\n');
   ```
   to:
   ```ts
   const body = reg.contextText.map(({ role, text }) => `${HEADERS[role].begin}\n${text}\n${HEADERS[role].end}`).join('\n\n');
   ```

## Tests

`src/monitor/manager.test.ts`'s `'snapshotContext writes the accumulated context to a file and opens it in an editor tab'` test (`:214`) already asserts `text.toContain('SENT TO MODEL')` / `'MODEL RESPONSE'` and matches content immediately following the header line — both keep passing unchanged since `BEGIN`/the box-drawing suffix is still on the same header line before the newline. Add two assertions to the same test confirming the closing markers are present and follow the content:

```ts
expect(text).toContain('SENT TO MODEL END');
expect(text).toContain('MODEL RESPONSE END');
expect(text).toMatch(/Fix the failing test\n━━━━━━━━━━ MODEL RESPONSE END ━━━━━━━━━━/);
```

Run `./scripts/run.mjs check-diff` after implementing.

## Spec updates

- `product/specs/monitoring.md:17` — change "Each block is preceded by a header that delineates its direction" to describe the block as wrapped between a begin/end marker pair, e.g.: "Each block is wrapped between a pair of markers that delineate its direction — one immediately before and one immediately after its content — whether it was sent to the model... or is a response received from the model..., so the two are visually distinct rather than an undifferentiated run of text."

## Docs

- Checked `help.md` and `documentation/user-documentation/` for any mention of the context-snapshot delimiter format — none found. No documentation update needed.

## Out of scope

- `src/monitor/framing.ts`'s per-session random delimiter (a different, security-relevant delimiting mechanism for flush prompts sent to the model, already wraps content both before and after — see `frameEntry`). Not part of this issue.
- The ACP transcript's own reply rendering (`product/specs/acp.md:17`), which intentionally shows no delimiter lines at all per a recent, separate fix (#441) — untouched by this change.
