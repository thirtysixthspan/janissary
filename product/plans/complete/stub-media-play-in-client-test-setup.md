# Stub HTMLMediaElement.play() in client test setup to remove jsdom warning

**Complexity: 1/10** — one shared setup stub plus one focused test and one spec line, 2 requirements and 2 scenarios (p=3.31).

## Goal

The client test suite prints `Not implemented: HTMLMediaElement's play() method` four times because jsdom has no media pipeline and the real video view calls `play()` on mount. The goal is to make that warning disappear for the whole suite by stubbing the unimplemented method once in the shared client test setup, the same way jsdom's missing canvas implementation is already handled, without changing any application behavior.

## Requirements

1. The client test suite no longer emits the warning `Not implemented: HTMLMediaElement's play() method` when a test renders a media element and calls `play()`.
2. Calling `play()` on a media element in the client test suite returns a settled promise rather than throwing or returning `undefined`.

## Design decisions

- Stub the unimplemented jsdom method once in the shared client test setup instead of patching the individual tests that happen to render media views, so the warning cannot reappear in a future test.
- Have the stub return a resolved promise, because the application code defensively attaches `.catch()` to the value returned by `play()` and that path must stay valid.
- Change only test infrastructure and its spec; jsdom's missing media pipeline is a test-environment gap, not a runtime bug, so application media playback code stays untouched.

## Assumptions

1. jsdom's `play()` is an unimplemented method that emits a `jsdomError` — `node_modules/jsdom/lib/jsdom/living/nodes/HTMLMediaElement-impl.js:105` ("`play() {`" calls `notImplementedMethod`), which vitest forwards to `console.error`.
2. The four warnings come from one test file that renders the real video plugin — `web/src/MountedViewLayers.video-playback.test.tsx:72` renders `MountedViewLayers` with a video tab, and `web/src/plugins/video/VideoTab.tsx:35` calls `videoRef.current?.play()` on mount.
3. The shared setup is the established home for such stubs — `web/src/test/setup.ts:12` contains `HTMLCanvasElement.prototype.getContext = () => null;` with an explanatory comment.
4. Per-component tests already stub `play()` locally for behavior, not warning suppression — `web/src/plugins/video/VideoTab.test.tsx:40` and `web/src/plugins/audio/AudioTab.test.tsx:38`.

## Existing functionality

1. The shared client test setup — `web/src/test/setup.ts:12` stubs `HTMLCanvasElement.prototype.getContext` for the whole client project.
2. The real video plugin's mount-time playback — `web/src/plugins/video/VideoTab.tsx:35` calls `play()` when the tab is active on mount.
3. Local `play()` stubs in component tests — `web/src/plugins/video/VideoTab.test.tsx:40` overrides `HTMLMediaElement.prototype.play` with its own implementation.
4. Vitest's jsdom environment forwards jsdom's virtual console to `globalThis.console`, so the warning is observable through a `console.error` spy.

## Implementation steps

1. In `web/src/test/setup.ts`, beside the existing canvas stub, assign `HTMLMediaElement.prototype.play` a function that returns a resolved `Promise<void>`. Add a short comment explaining that jsdom has no media pipeline, the stub keeps the warning out of test output, and the resolved promise preserves the application's defensive `.catch()` path.
2. Add a focused test to the existing `web/src/test/setup.test.ts` that spies on `console.error`, creates a media element, calls `play()`, awaits the returned promise, and asserts that no error mentioning the HTMLMediaElement `play` method was logged. Mirror the `vi.spyOn(console, 'error')` pattern already used in the client suite, and keep the existing canvas-stub test untouched.
3. Update the "Client test isolation" section of `product/specs/testing.md` to state that media `play()` is stubbed to a resolved promise for the same reason as the canvas stub, keeping jsdom's unimplemented-media warning out of test output.
4. Run `$janissary/scripts/run.mjs check-diff` and resolve any failures before moving on.

## UI design

None. This change touches test setup, a test file, and a spec; it adds or changes no user interface.

## Tests

1. Requirement 1: a new test in `web/src/test/setup.test.ts` asserts that calling `play()` on a media element logs no warning mentioning the HTMLMediaElement `play` method. This test fails against jsdom's unstubbed `play()`, which emits the warning.
2. Requirement 2: the same test asserts that `play()` returns a promise that resolves, which fails against jsdom's unstubbed `play()` because that returns `undefined` and logs an error.
3. Regression coverage: the existing `VideoTab.test.tsx`, `AudioTab.test.tsx`, and `MountedViewLayers.video-playback.test.tsx` tests must still pass with their own local stubs intact; `$janissary/scripts/run.mjs check-diff` exercises them.

## Out of scope

- Stubbing other jsdom-unimplemented media methods (`pause`, `load`) or the separate `HTMLCanvasElement.toDataURL()` warning tracked as its own backlog issue.
- Removing the local `play()` stubs in the video and audio component tests; those simulate track-start behavior rather than only suppressing a warning.
- Changing application media playback code, `video-tab.md`, `audio-tab.md`, help pages, or user documentation. No user-visible behavior changes.

## Verification

`$janissary/scripts/run.mjs check-diff` first. Then run `npm run test:client` and confirm that the four `Not implemented: HTMLMediaElement's play() method` lines no longer appear in the output while the suite still passes. Finally read `web/src/test/setup.ts` and confirm the `HTMLMediaElement.prototype.play` stub returns a resolved promise with the explanatory comment.
