# Startup help transcript tab identity

**Complexity: 1/10** — The WebSocket flow and Markdown assertion already exist; only the follow-up state predicate must consistently identify the `janus` tab by label.

## Goal

Keep the token-gated startup test finding streamed help output when notifications precede `janus` in a state snapshot.

## Approach

For each state event received after sending `help`, find the tab labeled `janus` and inspect that tab's `bufferLines` for a Markdown line. Retain the real WebSocket connection, existing startup visibility/focus and hidden-system assertions, and transcript check.

## Implementation steps

1. Update the follow-up `waitFor` predicate in `src/index.test.ts` to identify `janus` by label before checking for Markdown.
2. Clarify in `product/specs/tabs.md` that startup notifications do not redirect the active `janus` shell's command output.
3. Run the focused `accepts a token-gated client and streams transcript state` test and `./scripts/run.mjs check-diff`.

## Tests

- Run the focused WebSocket test in `src/index.test.ts`.
- Run `./scripts/run.mjs check-diff`.

## Out of scope

Do not change production startup behavior, WebSocket authentication, tab ordering, system-shell visibility or focus, timeout values, or the existing transcript assertion.
