# Capture expected test diagnostics

**Complexity: 4/10** — test-only changes across server and client fixtures; no runtime behavior changes.

## Goal

Keep diagnostics produced by deliberate invalid-input cases and incomplete fixtures from hiding unexpected failures in the test output.

## Approach

Capture and assert the invalid-config and history warnings at their source tests. Capture the known missing-conversation warning in the conversation manager fixture and reject any other stderr output there. Stub jsdom's unsupported canvas context in image-tab tests. Audio and video tests already stub media playback and retain their playback-refusal and decode-fallback assertions.

## Implementation steps

1. Capture and assert the invalid-config fallback warning in `src/config.test.ts`.
2. Capture the expected global-history warning in the write-failure and corrupt-file tests in `src/global-history.test.ts`.
3. Capture the known incomplete-conversation warning in `src/conversations/manager.test.ts` and fail on any other stderr diagnostic.
4. Stub the canvas context in `web/src/plugins/image/ImageTab.test.tsx` so editor tests do not invoke jsdom's unimplemented method.

## Tests

- Run the targeted config, global-history, conversation manager, image tab, audio tab, and video tests.
- Run the diff-scoped lint, typecheck, and tests.
- Confirm the existing image/video fallback assertions still pass.

## Spec and documentation

No spec or public documentation change is needed because application behavior is unchanged.

## Out of scope

- Changing runtime warning, fallback, canvas, or media behavior.
- Suppressing unexpected diagnostics in other test suites.
