# Shared external-open and size helpers for the file-backed tab plugins

**Complexity: 3/10** — one new host-side module plus four small plugin edits; no contract change, no capability added, no wire type touched.

## Goal

Stop the bundled file-backed tab plugins from each carrying their own copy of the same two operations. `src/plugins/audio/activate.ts`, `video/activate.ts`, `image/activate.ts`, and `markdown/activate.ts` each define a private `openExternal`; audio and video repeat the same configured-viewer-then-OS-default-then-give-up chain verbatim apart from the noun in the message, and all four repeat the same `statSync` / `humanSize` / fall back to `'unknown'` block. Audio and video additionally define an identical `isPlayable` that differs only in which manifest's `fileExtensions` it indexes.

The gap is in the host's own plugin-side toolkit rather than in the plugins: `TabPluginServerCapabilities` supplies `openExternally`, `note`, and `configuredViewer` as primitives, but the composed operation every one of these plugins actually performs has no single definition. Give it one, next to the plugin API, and delete the copies.

## Approach

Add `src/plugins/files.ts` beside `src/plugins/api.ts`. It holds plain functions that take a `TabPluginServerCapabilities` as an argument — not new capabilities on the contract. That distinction matters: adding a capability would change `TabPluginCapabilityName`, the v1 capability set, every manifest that wants it, and the developer documentation's capability count, for behavior that is pure composition over primitives the plugins already hold. A helper module changes none of that, so the API version stays where it is and the frozen `fixture-v1` compatibility fixture is untouched.

Three exports:

- `fileSize(file)` — `humanSize(statSync(file).size)`, falling back to `'unknown'` when the stat throws. The dispatcher checks existence before dispatch, so the fallback covers a race with deletion rather than an ordinary miss.
- `openFileExternally(file, capabilities, viewer)` — hand the file to the OS and report the outcome: `Opening <name> in your default <viewer>…` on success, `No <viewer> available. The file is at <file>` otherwise. This is the whole operation for a plugin that does not ask for the `configuredViewer` capability.
- `openFileInConfiguredViewer(file, capabilities, viewer)` — try the viewer the user configured first, reporting it by name, and otherwise delegate to `openFileExternally`. Composed from the function above rather than repeating its two branches, so there is exactly one definition of the fallback.

The split into two functions rather than one with a boolean flag is load-bearing: `image` and `markdown` do not declare `configuredViewer`, and the host's capability guard disables a plugin that calls one its manifest never asked for. A plugin picks the function matching the capabilities it declared, and the wrong pairing is visible at the call site.

A third export, `servesContentType(declaration, file)`, answers "does this declaration serve a content type for this file's extension" — the question both `isPlayable` copies ask. It reads the manifest rather than a hand-maintained list, so an extension claimed for ownership but served with nothing (audio's `.wma`, video's `.mkv` and friends) keeps routing to the external player exactly as it does today.

`src/plugins/page/activate.ts` keeps its own external opener. Its target is a web address rather than a file: it has no basename, no size, no configured viewer, and its give-up message names an address rather than a path. Folding it into a file-shaped helper would mean parameterizing away everything the helper is about, so it stays as it is.

The plugin import boundary in `eslint.plugin-boundaries.mjs` has to learn about the new module. It restricts a concrete server plugin to `../api.js` plus three named host utilities, so `../files.js` has to join that allowlist — the same allowance the size formatter, the web-target normalizer, and the numbered-sibling writer already hold, and for the same reason the comment there gives: a pure function with a caller on each side of the boundary. `../../openers/size.js` comes off the list in the same edit, because after this change no concrete plugin imports it; the formatter is reached through `fileSize` instead. That is a net tightening rather than a widening — one composed helper replaces one raw primitive.

One user-visible string changes. The image plugin currently notes `Opening <name> in your image viewer…` where the other three say `your default <noun>`. That "default" is what the OS hand-off actually does in every one of the four cases, and image is the lone omission rather than a deliberate distinction, so the shared helper says `your default image viewer` and image adopts the wording its siblings already use. The failure message (`No image viewer available. …`) is unchanged.

## Implementation steps

1. Add `src/plugins/files.ts` exporting `fileSize`, `openFileExternally`, `openFileInConfiguredViewer`, and `servesContentType`, importing `humanSize` from `../openers/size.js` and the declaration and capability types from `./api.js`.
2. In `eslint.plugin-boundaries.mjs`, swap `../../openers/size.js` for `../files.js` in the concrete-server-plugin allowlist, and update the comment above it to name the new module and what it composes.
3. `src/plugins/audio/activate.ts` — delete `isPlayable`, `sizeOf`, and the thirteen-line `openExternal`. Replace `openExternal` with a three-line wrapper delegating to `openFileInConfiguredViewer` with the `audio player` noun, so the opener and the inline fallback keep their existing call shape. Replace `sizeOf(...)` with `fileSize(...)` at all three call sites and `isPlayable(file)` with `servesContentType(audioManifest, file)`. Drop the now-unused `statSync` and `humanSize` imports.
4. `src/plugins/video/activate.ts` — the same, with the `video player` noun and `videoManifest`, and replace the inline `statSync` block inside the `openOrFocusTab` factory with `fileSize(file)`.
5. `src/plugins/image/activate.ts` — replace `openExternal`'s body with `openFileExternally(file, capabilities, 'image viewer')` and the inline `statSync` block in `imagePayload` with `fileSize(file)`.
6. `src/plugins/markdown/activate.ts` — replace `openExternal`'s body with `openFileExternally(file, capabilities, 'viewer')` and the inline `statSync` block with `fileSize(file)`.
7. Run `./scripts/run.mjs check-diff` after each step.

## Tests

New `src/plugins/files.test.ts`, mirroring the capability-fixture style of `src/plugins/audio/activate.test.ts`:

- `fileSize` renders a real file's size through `humanSize`, and answers `'unknown'` for a path that does not exist.
- `openFileExternally` notes the default-viewer confirmation when the hand-off succeeds, and the path-reporting message when it fails.
- `openFileInConfiguredViewer` launches the configured application and names it in the note.
- `openFileInConfiguredViewer` skips the named launch entirely when no viewer is configured, and falls back to the OS default when a named launch fails, reporting the default wording either way.
- `openFileInConfiguredViewer` reports the path when neither the configured application nor the OS default launches.
- `servesContentType` accepts an extension the declaration serves, rejects one it claims but serves with nothing, rejects an extension it does not claim, and matches case-insensitively.

Existing suites carry the rest of the proof: the audio, video, and markdown opener tests already pin every note these helpers now produce and must pass unchanged. `src/plugins/image/activate.test.ts` updates the one success-note assertion to the harmonized wording.

## Out of scope

- Adding a capability to `TabPluginServerCapabilities`. The helpers compose existing primitives; widening the contract would be an API change under §4 of the plugin guidelines for no gain.
- `src/plugins/page/activate.ts`, whose external opener acts on a web address rather than a file.
- The `schedules` and `fixture-v1` plugins, which open no files.
- Developer documentation for the helpers. `documentation/developer-documentation/tab-plugins.md` documents the v1 contract, which does not change; the helpers are an internal convenience for bundled plugins, not something a third-party plugin author is promised.
