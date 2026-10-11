# Reject malformed OAuth JWT segments

**Complexity: 2/10.** Tighten one parser condition and extend its existing unit and provisioning tests.

## Goal

A saved access token with an empty or malformed JWT segment is ignored before the application prepares OAuth storage or changes a workspace's data location.

## Approach

Require exactly three nonempty base64url segments before decoding the payload. Keep the existing object, expiry, account identity, and token checks, including acceptance of expired access tokens for OpenCode refresh. This validates syntax only; it adds no signature verification, refresh logic, or provider-specific claim validation.

## Implementation steps

1. Update `src/project/opencode-oauth.ts` and extend `src/project/opencode-oauth.test.ts` with malformed segment syntax and decoded payload shapes. Add malformed-login provisioning cases in `src/sandbox/opencode-data.test.ts`. Run `./scripts/run.mjs check-diff`.
2. Clarify ignored malformed login behavior in `product/specs/workspaced-agent.md`. Existing documentation already states invalid saved credentials leave API-key authentication unchanged, so it needs no update. Run `./scripts/run.mjs check-diff`.
3. Promote the plan, remove only the JWT finding, verify, and push a new commit to PR #1671 without changing its description or merging it.

## Tests

- Empty header or signature segments are rejected even when the payload has a valid expiry.
- Illegal characters in the header, payload, or signature are rejected, including characters permissive Buffer decoding would discard.
- Decoded null, array, boolean, number, and string payloads are rejected.
- Malformed saved JWTs create no private auth file and install no data-home redirect.
- Existing valid conversion, account identity, milliseconds, and expired-token refresh-input tests remain passing.

## Out of scope

Signature verification, token refreshing, new credential formats, remote forwarding, and transcript storage injection. No code comments or new public documentation.
