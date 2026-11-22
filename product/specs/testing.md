# Automated testing

### Server durable-history isolation

Running unrelated controller tests leaves existing project ACP history unchanged, including open sessions and expired records. Tests use isolated scratch projects and await shutdown before removing their storage. Tests that depend on the checkout's working directory preserve those directory semantics while isolating record storage.

Dedicated recorder and controller persistence tests continue to exercise real storage in scratch projects, including startup crash recovery, shutdown persistence, and expiry. See [[acp-records]].

### Client test isolation

Client tests run with a DOM environment and isolated module state for each test file. The DOM environment is prepared once per worker and reused across its files. Cleanup removes rendered React trees after each test.

Canvas contexts are unavailable throughout the client suite: requesting one returns `null`, so code that measures text or captures image frames takes its existing no-canvas fallback. This keeps jsdom's unimplemented-canvas warning out of test output without requiring a native canvas package, and tests that need drawing behavior supply their own fake context.

Media playback is stubbed the same way: `play()` resolves to a settled promise, so jsdom's unimplemented-media warning stays out of test output while the application's promise-based handling still works. Tests that need specific playback behavior supply their own override.

Canvas encoding is stubbed the same way: `toDataURL()` returns a minimal PNG data URL, so an image or video save keeps its intent payload valid and jsdom's unimplemented-canvas-encoder warning stays out of test output. Tests that assert the actual encoded bytes supply their own override.

### Diff-scoped help tests

When a Markdown file under `help/` changes, the diff-scoped check runs `src/commands.test.ts` in the server project. That test reads the command table and help pages directly, so it covers help changes that Vitest's changed-source dependency detection cannot associate with a test file.
