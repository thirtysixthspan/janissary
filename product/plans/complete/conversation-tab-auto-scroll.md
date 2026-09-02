# Fix: keep the latest conversation output visible

**Complexity: 3/10** — the conversation body already owns its scroll container and receives each query and response update as a new payload. The fix adds one local ref and one focused effect in `ChatTab.tsx`, interaction tests in its existing test file, and a concise spec update. It requires no protocol, server, persistence, or plugin-contract changes.

## Goal

Keep the active conversation tab scrolled to its newest turn when a user query appears and while the model response streams, so the latest query and response remain visible.

## Approach

Attach a ref to the existing `.chat-turns` scroll container. On the initial active render, when the tab becomes active, and whenever the last turn's query, response, error, or streaming state changes, set the container's `scrollTop` to its `scrollHeight`.

Depend on the last turn's scalar content rather than the whole turns array. Loading older history prepends turns while leaving the last turn unchanged, so that action must preserve the user's viewport instead of jumping back to the bottom. Hidden plugin tabs remain mounted, so the effect also gates on `capabilities.active` and runs when a conversation becomes visible again.

## Implementation steps

1. Update `web/src/plugins/chat/ChatTab.tsx` with a scroll-container ref and a tail-content effect that pins active new output to the bottom without reacting to older-history prepends.
2. Run `./scripts/run.mjs check-diff` and resolve any failures before adding tests.
3. Extend `web/src/plugins/chat/ChatTab.test.tsx` with scroll-metric coverage for a new user query, a growing streamed response, and an older-history prepend.
4. Run `./scripts/run.mjs check-diff` and resolve any failures.
5. Update `product/specs/conversations.md` with the conversation tab's latest-output scrolling behavior.
6. Run `./scripts/run.mjs check-diff` and resolve any failures.

## Tests

- Rendering a new last-turn query moves the active conversation viewport to its current bottom.
- Growing the last turn's streamed response moves the viewport to the new bottom.
- Prepending older turns without changing the latest turn preserves the current scroll position.

## Out of scope

- Changes to the 20-turn history window or the `load-older` intent.
- Manual keyboard, wheel, or scrollbar navigation controls.
- A shared transcript-scroll abstraction or cross-feature import from the agent transcript.
- Scrolling the conversation list or any other plugin tab.

## Verification

- `./scripts/run.mjs check-diff` passes after the implementation, tests, and spec update.
- PR #952 remains open and receives the completed commit on `feature/conversations-plugin`.
