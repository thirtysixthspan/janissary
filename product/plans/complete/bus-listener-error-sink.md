# Report the errors the message bus catches out of its listeners

## Complexity

4/10 — an injectable error sink on one class, a dedupe map, and test extensions; the isolation semantics stay exactly as they are.

## Goal

`MessageBus.emit` wraps each listener call in a `try`/`catch` with an empty body, so subscriber isolation — which is correct and must stay — is implemented as total silence: the process-wide bus that carries `state: dirty`, every `pty` data and exit event, the transcript events, and the schedule and conversation change signals has no diagnostic path of any kind for a subscriber that throws. A listener that throws on every event of its type stops doing its job permanently while the app keeps running and reports nothing.

## Approach

Give `MessageBus` an injectable error sink rather than wiring it to any particular reporting module:

- An optional constructor argument `onListenerError(channel: string, type: string, error: unknown): void`, defaulting to a function that writes one line to stderr via `errorText` from `src/error-text.ts`.
- Called from the `catch` in `emit` inside its own `try`, so a throwing sink cannot escape into the emit path it was added to protect.
- Isolation semantics unchanged: later listeners still run, `emit` still never throws.
- The sink stays out of `src/notifications.ts`, whose `notify` needs a `Managers` the bus does not and must not hold.
- Dedupe at the sink, not in `emit`: report at most once per `channel:type` per listener until a subsequent successful call clears it, so a subscriber failing on every `pty: data` event produces one line rather than thousands. Implementation: a `Map<string, Set<AnyListener>>` of currently-reported failing keys; a listener's error is reported only when it is not already in the set for its key, and the key's set entry is dropped when that same listener handles an event without throwing.

## Implementation

1. Add the sink parameter, the default stderr reporter, the dedupe map, and the guarded `catch` reporting in `src/bus.ts`.
2. Extend `src/bus.test.ts` with the cases below.
3. Run `./scripts/run.mjs check-diff` after each step.

## Tests

Extend `src/bus.test.ts`:

- the sink is invoked with the channel, type, and error for a throwing listener;
- later listeners still run and `emit` still does not throw when the sink itself throws;
- repeated failures from one listener on one `channel:type` report once until a successful call clears them;
- the default sink is quiet in the rest of the suite — the existing throwing-listener case constructs its bus without a sink, so it must now assert (or at least tolerate) the stderr line without failing; use a spied or injected sink where an assertion is needed and confirm the default path stays silent elsewhere.

## Out of scope

- Wiring the sink to `src/notifications.ts` or any particular reporting module.
- Changing isolation semantics, delivery order, or the bus's channel map.
