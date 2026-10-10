# Republish the launcher's configuration when the file behind it changed

**Complexity: 4/10** — one more fingerprint beside the row one, one host fake made faithful, and a test for the case the fake was hiding.

`readCommands` in `src/plugins/launcher/activate.ts` re-reads `.janissary/launcher.json` — or the home override that replaces it — into module state on every `launcher` invocation, so the state is fresh. What reaches the user is not: `republish` decides whether to publish by comparing rows alone, and `rowsChanged` in `src/plugins/launcher/payload.ts` compares `LauncherTabRow[]`. A second `launcher` with no tab row moved is a no-op, so the rail still shows the labels and commands from the file as it was when the tab was created — while the server resolves `run-command` ids against the *new* entries. The visible rail and the dispatched command can disagree, and the user has no way to see it.

The test suite could not have caught it, because the fixture's `openOrFocusTab` runs the creation factory on every call. The real `openPluginTab` in `src/tab/openers.ts` focuses an existing tab and returns without running the factory, so the case the bug lives in — an existing singleton, re-invoked — never appeared.

## Goal

A second `launcher` republishes when the command configuration behind the rail has changed, even with no tab row moved, and the test fixture behaves like the host about an existing singleton.

## Approach

1. **`src/plugins/launcher/payload.ts`** fingerprints the configuration half of the state — commands, source, file path, and problem — beside `rowsChanged`, and records the fingerprint it last published. `republish` publishes when either half has moved. The two halves stay separate fingerprints rather than one blob, because they move for different reasons and a row-only comparison is the bug.
2. **`src/plugins/launcher/activate.test.ts`**'s fixture gains an open-instance-key set: `openOrFocusTab` runs the factory once and focuses thereafter, recording the focus separately, which is what `openPluginTab` does. The existing "focuses the singleton a second time" case then asserts one creation and two focuses, which is what it always claimed.
3. The disposal case models the host closing the plugin's tab with it, so the next invocation creates one rather than focusing a tab that is gone.

### Rejected alternatives

- Publishing unconditionally on every `launcher`. It would broadcast on every invocation, including the common one where nothing at all changed.
- Making the client re-read the file. The payload is the one thing a plugin body is allowed to know, and `state.commands` is already the host's own read of it.
- Comparing the whole payload object. The summaries map rides the same payload and is written by a different path, so it would couple the rail's publication to the summarizer's.

## Implementation steps

1. Add the configuration fingerprint and the combined publication decision to `payload.ts`.
2. Point `republish` at it and record what it published.
3. Make the activation fixture's `openOrFocusTab` faithful, and adjust the two cases it changes.
4. Add the test below and run `./scripts/run.mjs check-diff`.

## Tests

- `src/plugins/launcher/activate.test.ts`: with the singleton open and no tab row moved, edit `launcher.json`'s command and label, invoke `launcher` again, and assert the published payload carries the new rail and that the row the client clicks dispatches the new command.
- The mirrored case: invoking `launcher` again with nothing changed publishes nothing, so the new fingerprint cannot become a per-invocation broadcast.
- The existing cases keep their meaning, including the disposal one.

## Spec updates

- `product/specs/launcher.md`: the command rail section says each `launcher` invocation re-reads the file in effect and republishes the rail when it has changed.

## Out of scope

- Watching the file for changes. The rail updates when the launcher is invoked, and the Configure button opens the file an edit would be made in.
- Per-entry merging of a home file and a project file, which is the documented asymmetry rather than a publication question.
