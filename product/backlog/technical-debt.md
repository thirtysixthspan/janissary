# technical-debt

## ready

* Restore the WebSocket client after a bfcache navigation: `web/src/main.tsx` disposes the single `JanusClient` on every `pagehide`, including when the browser places the page in the back/forward cache. Returning with Back or Forward restores the same React tree but leaves it with the closed client and cleared listeners, and there is no `pageshow` reconnection path. Handle persisted page restoration by recreating or reconnecting the client and refreshing its initial state, with coverage for a `pagehide`/persisted-`pageshow` cycle. Severity: **high**.

## development

## deferred

## declined
