# Plan: Make the e2e browser and its guard name the same loopback address

**Complexity: 2/10** — one shared constant, one added launch option, two call sites rewritten through a helper, and tests. No behaviour changes on a host where `localhost` already resolves to IPv4 first.

## Goal

The two ends of the browser's private hop disagree about what "loopback" means.

`runE2EBrowser` calls `chromium.launchServer({ port, wsPath, … })` without a `host`, and Playwright's `host` "is optional and defaults to `localhost`". The guard dials a URL it builds itself: `ws://127.0.0.1:<upstreamPort><upstreamPath>`. On a host whose resolver answers `localhost` with `::1` first, the browser comes up listening on IPv6 loopback only and every guard connection is refused against IPv4. The endpoint variable is still set and still looks right, the browser process is alive, and nothing reports a failure — `onGone` fires for a child that exits or a guard that cannot listen, and neither happened. The tab simply has a browser it can never reach.

The upstream listener already advertises the address it actually bound, precisely so the two ends cannot disagree; this implementation discards that and reconstructs an IPv4 URL from the port it asked for. `src/browser/e2e-guard.test.ts` binds its stub upstream explicitly to `127.0.0.1`, so the suite has never exercised the disagreement.

## Approach

Name the address once and have every participant use that name.

Add `src/browser/e2e-loopback.ts` holding `E2E_LOOPBACK_HOST` and a `loopbackWsUrl(port, wsPath)` helper. `127.0.0.1` is the right value to standardise on: it is already what the published endpoint handed to the agent says, so pinning the other two ends to it changes nothing a working host is doing today, and it keeps the guard's own bind, the guard's upstream dial, the child's listener, and the published endpoint as four uses of one literal instead of four independent ones.

- `e2e-child.ts` passes `host: E2E_LOOPBACK_HOST` to `launchServer`, replacing the `localhost` default. This is narrower than the default, not wider: the Playwright default already accepts loopback only, and an explicit `127.0.0.1` accepts loopback only on one family.
- `e2e-guard.ts` binds `E2E_LOOPBACK_HOST` and builds its upstream URL with `loopbackWsUrl`.
- `e2e-server.ts` builds `JANISSARY_BROWSER_WS_ENDPOINT` with the same helper.

Loopback-only binding is retained everywhere; nothing in this change lets the browser or the guard accept a connection from off the host.

## Implementation steps

1. Add `src/browser/e2e-loopback.ts` exporting `E2E_LOOPBACK_HOST` and `loopbackWsUrl`.
2. `src/browser/e2e-child.ts` — add `host: E2E_LOOPBACK_HOST` to the `launchServer` options and note in the doc comment why the default is not used.
3. `src/browser/e2e-guard.ts` — use the constant for the `WebSocketServer` host and the helper for `upstreamUrl`.
4. `src/browser/e2e-server.ts` — use the helper for the published endpoint.
5. Run `./scripts/run.mjs check-diff`.

## Tests

- `src/browser/e2e-child.test.ts` (new, with `playwright` stubbed so no Chromium starts):
  - `launchServer` is given an explicit `host`, and it is the same constant the guard dials — the assertion that would have failed before this change;
  - that host is loopback, not a wildcard address, so the browser is never opened to the network;
  - the port, `wsPath`, `headless`, `executablePath`, and `downloadsPath` options are unchanged by this edit.
- `src/browser/e2e-guard.test.ts`:
  - the existing stub-upstream helper takes a host, keeping every current case on `127.0.0.1`;
  - a stub upstream bound on `::1` alone — the shape of an IPv6-first host — is not reached by the guard, and the client session ends rather than hanging with a half-open relay. Skipped on a host with no IPv6 loopback to bind.
- `src/browser/e2e-server.test.ts` — the published endpoint's host is the shared constant, so the address the agent is handed cannot drift from the one the guard binds.

## Spec and documentation

`product/specs/sandbox.md` states that the guard listens on loopback and that the browser's own address stays inside the Janissary process. That gains one clause: both ends of the private hop are pinned to the same loopback address rather than resolved by name, so a host that answers `localhost` with IPv6 first cannot leave the two halves talking past each other. No `help.md` or user-documentation change: neither names an address.

## Out of scope

- Reading the listener's advertised endpoint back from the child instead of reconstructing it. It would be the stronger fix, but the endpoint is required synchronously, before the child has started, and reworking that is the port-allocation change, not this one.
- Supporting an IPv6-only host that has no `127.0.0.1` at all. Every other loopback listener in the codebase assumes IPv4 too; changing that assumption is its own change.
- The other browser findings in `product/backlog/pull-request.md`.
