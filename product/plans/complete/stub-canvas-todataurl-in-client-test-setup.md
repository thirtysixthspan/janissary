# Stub HTMLCanvasElement.toDataURL() in client test setup to remove jsdom warning

**Complexity: 1/10** — no production lines or files (test setup plus one test and one spec edit), 3 requirements and 2 scenarios (p=2.96).

## Goal

The client test suite prints `Not implemented: HTMLCanvasElement's toDataURL() method: without installing the canvas npm package` because jsdom has no canvas encoder and the image save path calls `toDataURL('image/png')` for real in one integration test. The goal is to make that warning disappear for the whole suite by stubbing the unimplemented method once in the shared client test setup, the same way jsdom's missing `getContext` and media `play` are already handled, without changing any application behavior or adding a dependency.

## Requirements

1. The client test suite no longer emits the warning `Not implemented: HTMLCanvasElement's toDataURL() method: without installing the canvas npm package` when a test saves an edited image. This is the issue text verbatim: "resolve the warning in the test suite: Not implemented: HTMLCanvasElement's toDataURL() method: without installing the canvas npm package".
2. Calling `toDataURL('image/png')` on a canvas in the client test suite returns a data URL string rather than throwing or returning `undefined`, so the save path's `dataUrl` intent payload stays valid.
3. Tests that assert the actual data URL bytes keep their own local override and are unaffected by the shared stub.

## Design decisions

- Stub the unimplemented jsdom method once in the shared client test setup instead of patching the individual tests that happen to reach the save path, so the warning cannot reappear in a future test.
- Have the stub return a minimal PNG data URL string, because the application passes the result straight into an intent payload as `dataUrl` and that path must stay valid. Tests asserting specific bytes continue to override the stub locally, and `vi.restoreAllMocks()` returns them to this stub afterwards.
- Change only test infrastructure and its spec; jsdom's missing canvas encoder is a test-environment gap, not a runtime bug, so application canvas code stays untouched.

## Assumptions

1. jsdom's `toDataURL` is an unimplemented method that emits a `jsdomError` forwarded to `console.error` — `node_modules/jsdom/lib/jsdom/living/nodes/HTMLCanvasElement-impl.js:52` ("`toDataURL(...args) {`" calls `notImplementedMethod`), observed as the issue's warning text.
2. The warning comes from one integration test that saves for real — `web/src/App.test.tsx:654` clicks the Save button, reaching `flattenToPng` at `web/src/plugins/image/edit-render.ts:69-70` (`return canvas.toDataURL('image/png');`) with no local mock. Instrumenting the prototype confirmed this is the only caller in the suite that hits jsdom's implementation.
3. The shared setup is the established home for such stubs — `web/src/test/setup.ts:12` contains `HTMLCanvasElement.prototype.getContext = () = null;` and `web/src/test/setup.ts:17` contains `HTMLMediaElement.prototype.play = () => Promise.resolve();`, each with a why-comment.
4. Per-component tests already stub `toDataURL` locally for behavior, not warning suppression — `web/src/plugins/image/edit-render.test.ts:84`, `web/src/plugins/image/ImageEditor.test.tsx:17`, `web/src/plugins/video/useVideoShot.test.ts:16`, and `web/src/plugins/video/VideoTab.test.tsx:106` use `vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL')`.

## Existing functionality

1. The shared client test setup — `web/src/test/setup.ts:12` stubs `HTMLCanvasElement.prototype.getContext` and `web/src/test/setup.ts:17` stubs `HTMLMediaElement.prototype.play` for the whole client project.
2. The real image save path — `web/src/plugins/image/edit-render.ts:69-70` flattens the canvas with `canvas.toDataURL('image/png')`, consumed by `web/src/plugins/image/useImageEdit.ts:114` as the `dataUrl` of the `save-edit` intent.
3. Local `toDataURL` stubs in component tests — `web/src/plugins/image/edit-render.test.ts:84` and `web/src/plugins/image/ImageEditor.test.tsx:17` override the prototype method with `vi.spyOn` and restore it in `afterEach`.
4. Vitest's jsdom environment forwards jsdom's virtual console to `globalThis.console`, so the warning is observable through a `console.error` spy.

## Implementation steps

1. In `web/src/test/setup.ts`, beside the existing canvas and media stubs, assign `HTMLCanvasElement.prototype.toDataURL` a function that returns a minimal PNG data URL string. Add a short comment explaining that jsdom has no canvas encoder, the stub keeps the save path's intent payload valid and the warning out of test output, and no native canvas package is needed.
2. Add a focused test to the existing `web/src/test/setup.test.ts` that spies on `console.error`, calls `toDataURL('image/png')` on a freshly created canvas, asserts the returned value is the stub's data URL, and asserts that no error mentioning the HTMLCanvasElement `toDataURL` method was logged. Mirror the `vi.spyOn(console, 'error')` pattern used by the existing media-play test, and keep the existing canvas and media tests untouched.
3. Update the "Client test isolation" section of `product/specs/testing.md` to state that canvas `toDataURL()` is stubbed to return a minimal PNG data URL for the same reason as the existing canvas stub, keeping jsdom's unimplemented-canvas-encoder warning out of test output while tests that assert real bytes supply their own override.
4. Run `$janissary/scripts/run.mjs check-diff` and resolve any failures before moving on.

## UI design

None. This change touches test setup, a test file, and a spec; it adds or changes no user interface.

## Tests

1. Requirement 1: a new test in `web/src/test/setup.test.ts` asserts that calling `toDataURL('image/png')` logs no warning mentioning the HTMLCanvasElement `toDataURL` method. This test fails against jsdom's unstubbed `toDataURL`, which emits the warning.
2. Requirement 2: the same test asserts that `toDataURL('image/png')` returns the stubbed data URL string, which fails against jsdom's unstubbed method because it returns `undefined` and logs an error.
3. Requirement 3 / regression coverage: the existing `edit-render.test.ts`, `ImageEditor.test.tsx`, `useVideoShot.test.ts`, `VideoTab.test.tsx`, and the `App.test.tsx` image-save walk must still pass with their own local stubs intact; `$janissary/scripts/run.mjs check-diff` exercises them.

## Out of scope

- Installing the `canvas` npm package or any native canvas dependency.
- Stubbing other unimplemented jsdom APIs (navigation, `HTMLMediaElement.pause`/`load`, and so on) that emit their own unrelated warnings; the issue names only `toDataURL`.
- Removing the local `toDataURL` stubs in the image and video component tests; those simulate real encoding results for assertions rather than only suppressing a warning.
- Changing application canvas code, `image-tab.md`, `video-tab.md`, help pages, or user documentation. No user-visible behavior changes.

## Verification

`$janissary/scripts/run.mjs check-diff` first. Then run `npm run test:client` and confirm the `Not implemented: HTMLCanvasElement's toDataURL() method` line no longer appears in the output while the suite still passes. Finally read `web/src/test/setup.ts` and confirm the `HTMLCanvasElement.prototype.toDataURL` stub returns a PNG data URL string with its explanatory comment, and that `App.test.tsx`'s image-save walk passes.
