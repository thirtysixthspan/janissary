# Cache the task and profile listings instead of walking the disk on every state broadcast

**Complexity: 3/10** — one new server module of two small cached accessors, a two-line swap in `buildStateEvent`, one new test file, and two spec paragraphs. No wire, client, or command change.

`buildStateEvent` in `src/state-event.ts` includes `tasks: listTasks(controller.rootDir)` and `profiles: listProfileRows()`. `listTasks` (`src/tasks.ts`) recursively walks `ai/tasks` under both the project and `janissaryRoot()`, and `listProfileRows` (`src/profiles.ts`) lists the project and Janissary `profiles/` directories, all with synchronous `readdirSync`. `emitState` in `src/index.ts` calls `buildStateEvent` for every `state:dirty` event, which fires on essentially every mutation, including each chunk of shell and ACP output and each keystroke. So streaming output pays several synchronous filesystem walks on the event loop that serves every tab, and a deep `ai/tasks` tree or a slow disk becomes input lag across the whole app.

## Goal

A state broadcast reads the task and profile listings from disk at most once per second. Every other broadcast inside that window reuses the previous result.

## Approach

Add `src/state-listings.ts`:

- `LISTING_TTL_MS = 1000`.
- `cachedTasks(projectDir, now = Date.now)` returns the previous `listTasks(projectDir)` result when it was computed for the same `projectDir` less than `LISTING_TTL_MS` ago, and recomputes otherwise.
- `cachedProfileRows(now = Date.now)` does the same for `listProfileRows()`. It takes no key: the profile directories are process-wide state set once by `initProfileDir`.
- Both share one private helper that decides freshness. An entry whose age is negative (the wall clock stepped backwards) counts as stale, so a clock change can never pin an old listing in place.
- The module carries two short comments: one on `LISTING_TTL_MS` explaining why the listings are cached (they ride on every broadcast), and one on the helper explaining the negative-age rule. Neither reason is recoverable from the code alone.

`buildStateEvent` uses `cachedTasks(controller.rootDir)` and `cachedProfileRows()` in place of the direct calls. `listTasks`, `listProfileRows`, and `listProfiles` stay unchanged for their other callers (`profile list`, `profileNames`, completion, validation), which keep reading fresh from disk.

Both pickers open client-side from the rows already in the last snapshot, so the one-second window is the whole user-visible cost: a task or profile file created on disk can take up to a second to appear in its picker.

Rejected alternatives:

- A filesystem watcher (`fs.watch`) invalidating the cache. It reacts instantly, but recursive watching is platform-dependent, adds a resource that must be disposed with the controller, and the Janissary install root can be a directory the process should not hold watchers on. A one-second TTL removes the cost at the broadcast frequency that matters with none of that lifecycle.
- A timer that refreshes the listings in the background. It keeps walking the disk when nothing is broadcasting and needs its own teardown; a lazy TTL does no work while the app is idle.
- Invalidating on `profile save`. It would make one path instant but splits freshness rules across two mechanisms for a sub-second gain.

## Implementation steps

1. Add `src/state-listings.ts` with `LISTING_TTL_MS`, `cachedTasks`, and `cachedProfileRows` as described.
2. In `src/state-event.ts`, replace the `listTasks` and `listProfileRows` imports and calls with `cachedTasks(controller.rootDir)` and `cachedProfileRows()`.
3. Update `product/specs/task-picker.md` (the listing is no longer read fresh at each open; changes appear within about a second) and `product/specs/profiles.md` (the same window for the profile picker).

## Tests

`src/state-listings.test.ts` (new), mocking `./tasks.js` and `./profiles.js` to count walks and resetting the module between cases so each starts with an empty cache:

- `cachedTasks` walks once for repeated calls inside the interval and returns the same rows.
- `cachedTasks` walks again once the interval has elapsed and returns the new rows.
- `cachedTasks` walks again immediately when the project directory changes.
- `cachedTasks` walks again when the clock moves backwards.
- `cachedProfileRows` walks once inside the interval and again after it.

`src/tasks.test.ts` and `src/profiles.test.ts` stay unchanged and must keep passing.

## Out of scope

- Reducing how often the state broadcast itself fires, or sending listings only when they change (principle 8's delta sync).
- The other synchronous work inside `buildStateEvent` (`globalCommands`, `getConfig`).
- Making the listing walks asynchronous.
