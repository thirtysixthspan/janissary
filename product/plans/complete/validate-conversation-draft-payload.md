# Validate conversation draft payload

## Complexity

2/10.

## Goal

Restore the payload type boundary for the newly introduced conversation draft field.

## Approach

Extend the existing shared conversation payload guard to accept draftQuery only when undefined or a string. Keep empty and multiline strings intact and preserve list validation. The server activation and client entry already reuse this guard, so no coercion or parallel validator is needed.

## Implementation steps

1. Update `src/plugins/conversations/shared.ts`, add `shared.test.ts`, and add a real-client-entry rejection case in `web/src/plugins/PluginTabLayer.test.tsx`. Run `./scripts/run.mjs check-diff`.
2. Update `product/specs/conversations.md`, promote the plan, remove the resolved backlog entry, check and push the existing PR.

## Tests

Accept absent, undefined, empty, ordinary, and multiline drafts. Reject null, arrays, objects, numbers, and booleans on otherwise valid conversation payloads. Preserve valid and invalid list validation. Verify a malformed draft reaches the client's plugin failure boundary before the message input mounts or any intent is sent. Existing activation and composer tests remain valid.

## Out of scope

Coercion, conversation storage, host API changes, unrelated payload fields, public documentation additions, PR description changes, and merging. No new comments.
