# Monitor startup summary in owner tab

**Complexity: 3/10** — one new transcript line at an existing hook site (`onConnect` in `openMonitorSession`), reusing an existing provider/model formatter and a one-line extraction from persona text already present in every persona file.

## Goal

When a monitor's ACP session connects, its owner tab's transcript should immediately show that the monitor is up: the ACP connection, the model in use, and a one-sentence summary of the persona's role — instead of connecting silently and only surfacing anything once a suggestion or error appears.

## Approach

`openMonitorSession` (`src/monitor-session.ts`) already wires an `onConnect` hook that records `reg.info` and emits a dirty state event. This is the one place a monitor's connection becomes known, and there is existing precedent right next to it (`onError`) for writing a line into the owner tab's transcript via `managers.tab.append`.

The provider/model pairing is already formatted elsewhere for the connections panel (`monitorConnections` in `src/monitor-info.ts:21`): `` `${[reg.info.provider, reg.info.model].filter(Boolean).join('/')}` ``. Reuse that same join logic here rather than duplicating it.

Every persona file's body (`ai/personas/*.md`, stripped of its directive lines by `parsePersona`) opens with a single declarative sentence — "You are a helpful pair-programming monitor.", "You are a security monitor.", "You are a link scout.", etc. — followed by a period. A concise one-sentence summary can be produced by taking the persona body up to (and including) its first `.`, with no changes to any persona file.

Add a small formatting helper next to the existing ones in `src/monitor-info.ts` (read-only projections already live there) rather than inlining the logic in `monitor-session.ts`, so it stays unit-testable in isolation.

## Implementation steps

1. **`src/monitor-info.ts`** — add:
   ```ts
   export function personaSummary(persona: Persona): string {
     const period = persona.body.indexOf('.');
     return period === -1 ? persona.body.trim() : persona.body.slice(0, period + 1);
   }

   export function formatConnection(info: AcpInfo): string {
     return [info.provider, info.model].filter(Boolean).join('/');
   }
   ```
   Import `Persona` from `./personas.js` and `AcpInfo` from `./types.js`. Update `monitorConnections` to call the new `formatConnection` instead of its inline join, so the logic has one source of truth.

2. **`src/monitor-session.ts`** — in `openMonitorSession`'s `onConnect` hook, after `reg.info = info;`, append a transcript line to the owner tab before emitting the dirty event:
   ```ts
   onConnect: (info) => {
     reg.info = info;
     const connection = formatConnection(info);
     const summary = personaSummary(reg.persona);
     managers.tab.append(reg.owner, {
       input: '',
       output: `monitor ${reg.persona.name}: connected${connection ? ` (${connection})` : ''} — ${summary}`,
     });
     messageBus.emit('state', { type: 'dirty' });
   },
   ```
   Import `formatConnection` and `personaSummary` from `./monitor-info.js`.

## Tests

- **`src/monitor-session.test.ts`** — extend the existing "records connection info and emits a dirty state event on connect" test (around line 130) to also assert the new `append` call, e.g. `expect(append).toHaveBeenCalledWith('main', { input: '', output: 'monitor reviewer: connected (anthropic/sonnet) — Watch for bugs.' });` (the test's `makePersona()` already sets `body: 'Watch for bugs.'`). `makeManagers` already returns `append` as a spy, so no helper changes needed.
- **`src/monitor-info.test.ts`** (existing file covering `monitor-info.ts`) — add cases for `personaSummary` (returns the first sentence including its period; falls back to the trimmed full body when there is no `.`) and `formatConnection` (joins provider and model with `/`; omits the slash when only one is present; returns `''` when both are absent).

## Spec updates

- **`specs/monitoring.md`** — add a short note under "Starting a monitor" describing that once the ACP session connects, the owner tab's transcript shows a line naming the monitor, its connection (provider/model), and a one-sentence summary of the persona, before any suggestion has been produced.

## Out of scope

- No change to persona files — the summary is derived, not authored.
- No change to the connections-panel row rendering (`monitorConnections`) beyond sharing the extracted `formatConnection` helper; its output format is unchanged.
- No change to external-mode monitors' reporting-tab metadata line — this is a one-time startup transcript entry in the *owner* tab, not the persistent metadata header.

## Verification

- `./scripts/run.mjs check-diff` after each step.
- Manual verification is not practical in this environment (requires a live ACP subprocess connection), so behavior is covered by the unit tests above.
