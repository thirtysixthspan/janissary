# Declare the replay plugin's `isRecordingLive` capability

**Complexity: 2/10** — one line in a manifest and one test that builds its context the way the host
builds one. No behavior changes anywhere else, and no new module.

`src/plugins/replay/manifest.ts` declares `openOrFocusTab`, `rejectRequest` and `reportFailure`. The
server activation in `src/plugins/replay/activate.ts` reads `capabilities.isRecordingLive(file)` when it
builds a replay tab's payload, so the call goes to the throwing stub that `restrictToDeclared` in
`src/plugins/context.ts` installs for every capability a manifest did not ask for. The throw crosses
the plugin failure boundary, and the host disables `replay` for the life of the process:

```
Tab plugin "replay" disabled: used capability "isRecordingLive" without declaring it.
```

Every route into the feature is dead while that holds — `open <file>.cast`, `harness replay` and
`ssh replay` all reach a disabled plugin — so the built app ships documentation for a player it cannot
open. `product/specs/tab-plugins.md` already says the replay tab "needs two capabilities the others do
not: `copyText` … and `isRecordingLive`", so the spec is what the manifest should be matching.

The suite cannot see this. `src/plugins/replay/activate.test.ts` hands the activation a capability
object it assembles by hand, complete with a working `isRecordingLive`, so nothing in it passes through
`restrictToDeclared` and no test in the repository ever asks what the manifest grants. The fix
therefore carries its own guard: the same test file gets a context built the way the host builds one,
out of the real manifest.

## Approach

Declare the capability, and add one test that runs the activation against a context created by
`createPluginContext` from `src/plugins/context.ts` with the real `replayManifest`. The context's own
`isRecordingLive` implementation reads `liveRecordingPaths` from `src/plugins/live-recordings.ts`, which
walks `managers.tab.tabs` and asks `managers.harness.recordingPathOf(label)` — so a stub `Managers`
whose tab list carries a `harness` entry produces a genuinely live recording, and one without it
produces a finished one, with no recorder and no globals stubbed. The stub's `openPluginTab` invokes
the factory it is handed, which is how the payload reaches the test.

The hand-built capability object stays. Its cases stub a capability's return value directly, which is
the right tool for them and is not what went wrong here.

## Implementation steps

1. In `src/plugins/replay/manifest.ts`, add `'isRecordingLive'` to the `capabilities` array.
2. In `src/plugins/replay/activate.test.ts`, add a `hostCapabilities` helper that builds a context
   through `createPluginContext` with `replayManifest`, a stub `Managers` shaped like the one in
   `src/plugins/context.test.ts` — `fakeNotificationsHost` over a one-tab list, an `openPluginTab` that
   invokes the factory, and a `harness.recordingPathOf` the test can steer — and returns it with the
   keys and payloads it collected.
3. Add one test opening a recording through that context and asserting the payload reads
   `finished: true` for a file no tab is recording and `finished: false` for one that is.

## Tests

- `src/plugins/replay/activate.test.ts`: the new case fails on the undeclared capability, with the
  `used capability "isRecordingLive" without declaring it` error the host reports, and passes once the
  declaration is in. The existing cases in the file are untouched and continue to use the hand-built
  capabilities.

## Out of scope

- Every other bundled plugin's declared set. The new test is written against the replay plugin because
  that is the plugin this fixes; a shared guard over all bundled manifests is a separate change.
- Any change to `createPluginContext`, `restrictToDeclared`, or the capability's implementation — all
  three behave correctly.
- `help.md` and `documentation/user-documentation/`, which already describe the player this fix
  restores.