<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Play a recording that is still being written in real time, rather than idle-compressed as the plan and the spec both say it should be.

Existing Issue: The plan decided that "Compression applies only to a finished recording, and a live one plays in real time", and the specification and user documentation the pull request adds repeat it, but `usePlayback` compresses the timeline unconditionally — `compressIdle(events, idleLimit)` runs whatever `live` says — and every recording this version writes carries `idle_time_limit: 2`, so a live replay sprints through a session's silences and then sits pinned at the newest frame while the session is still working. Severity: 6/10

Existing Risk: 5/10 - A user watching a running session sees it appear to finish in seconds and hold still, so the replay stops being a mirror of the tab and starts looking like a stuck one; the only hint is a `live` badge on a timeline that is visibly not the session's.

Proposal Risk: 2/10 - The rule remains one line of state that a later edit could undo, so it needs a test that states it rather than one that happens to pass.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1515: play a live recording in real time instead of idle-compressing it". In `web/src/plugins/replay/usePlayback.ts`, make the compressed timeline conditional on liveness: compute the timeline as `compressIdle(events, live ? 'off' : idleLimit)` (memoized on `events`, `idleLimit`, and `live`), and stop deriving the control's state from the header alone — a live recording should show `idle off` rather than the recorded limit, since that is what it is applying. Leave the recorded-limit default, the cycle order, and the reporting of a recording's own limit untouched, so a finished recording still starts at the limit its header states. `web/src/plugins/replay/idle-compression.test.ts` already covers the rule in isolation and must keep passing; add a case to `web/src/plugins/replay/usePlayback.test.ts` asserting that a live recording's duration is the uncompressed one while a finished recording's is the compressed one, which is the behavior the specification now promises. Check `product/specs/harness-recording.md` § Retrieval and the recordings section of `documentation/user-documentation/advanced-agents/harness.md` still read correctly after the change — they should need no edit, since they already describe this behavior.

* Build the replayed terminal only once its recorded size is known, so the bytes already written are not lost when the header arrives.

Existing Issue: `useReplayTerminal` creates the terminal at the fallback 80x24 and lists `options.cols` and `options.rows` as effect dependencies, so a recording of any other size causes the effect to tear the terminal down and build a new one moments later — while `cursor.current`, the hook's record of how far the new terminal has been fed, survives and is never reset, so every event written before the rebuild is dropped and never re-written. Severity: 7/10

Existing Risk: 6/10 - Every replay of a recording that is not 80x24 opens showing a partial or empty screen that stays wrong until the user seeks backwards, which resets the cursor and happens to repair it; a user who does not seek sees a broken player with no indication why.

Proposal Risk: 2/10 - The rule becomes a conditional rather than a constructor argument, so a reader still has to know why the fallback exists.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1515: build the replay terminal once the recording's size is known". In `web/src/plugins/replay/ReplayTab.tsx`, do not call `useReplayTerminal` with `source.header?.cols ?? 80` and `source.header?.rows ?? 24`; pass the header itself and let the hook decline to build until it arrives, returning a `renderUpTo` that is a no-op until then, so the terminal is constructed once with the recorded grid and never rebuilt. Reset `cursor.current` in the same place the terminal is created as well as in the backward-seek branch, so any future rebuild cannot silently skip the bytes before it. If the hook keeps the fallback for a recording whose header never parses, say so in its own doc comment and cover it with a case in `web/src/plugins/replay/ReplayTab.test.tsx` — that file already stubs this hook, so a case asserting the tab still renders its metadata line and transport for an unreadable recording will pass through the same path.

* Keep a hidden replay's read position across a tab becoming visible again, rather than reading the whole recording a second time.

Existing Issue: `useReplaySource`'s effect depends on `[url, active]`, so a tab becoming visible again restarts it: the `CastStream` is replaced, the byte offset returns to zero, and the whole file is fetched and re-parsed from the beginning every time the user switches away and back. Severity: 5/10

Existing Risk: 4/10 - An hour-long recording re-read on every tab switch is a visible stall each time, and it grows with the recording rather than with the time since the last switch.

Proposal Risk: 2/10 - Two effects now share one fetch, so a future edit to either can race the other's cancellation.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1515: keep the replay read position when the tab becomes visible again". In `web/src/plugins/replay/useReplaySource.ts`, split the effect: one keyed on `url` alone owns the stream, the byte offset, the decoder, and the first whole-file read, and a second keyed on `active` only starts and stops the poll chain, leaving the offset and the parsed timeline untouched across a hide. Guard the resumed chain with a ref so a cleanup from an earlier `active` value cannot cancel the one that replaced it, and keep the `cancelled` flag as the single authority on whether a chain may schedule its next poll. `web/src/plugins/replay/useReplaySource.test.ts` already asserts that polling stops while hidden and resumes when shown; extend that case to assert the second fetch asks for a range from the previous offset rather than reading the file again, which is the behavior this entry is about.

* Remove the unused route exports and the unread terminal ref the new modules leave behind.

Existing Issue: `src/plugins/core-route-claims.ts` exports `pluginCoreRoutes` and `coreRouteOwner` that nothing imports — the host resolves its own map from the declarations it was constructed with, which is what makes a fixture catalog authoritative — and `web/src/plugins/replay/useReplayTerminal.ts` keeps a `live` ref it assigns and never reads, left over from when the copy chord read the terminal through it. Severity: 2/10

Existing Risk: 2/10 - Dead exports read as the supported entry point and invite a second call site beside the one the host actually uses; the dead-check tooling in the human's end-of-work gate reports them as unused.

Proposal Risk: 1/10 - Nothing reads either symbol, so removing them cannot change behavior.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1515: remove the unused route exports and the unread terminal ref". Delete `pluginCoreRoutes` and `coreRouteOwner` from `src/plugins/core-route-claims.ts`, leaving `resolveCoreRoutes` as the module's single export, and remove the `live` ref and its assignment from `web/src/plugins/replay/useReplayTerminal.ts`, since the copy chord closes over the terminal and the capability directly. Confirm nothing else imports either symbol first — a grep for `pluginCoreRoutes` and `coreRouteOwner` across `src/` and `web/src/` is the whole check — and leave `resolveCoreRoutes`'s refusal-recording behavior and the copy chord's behavior untouched.

* Document and test the `i` chord, which the pull request description's key list omits.

Existing Issue: The replay tab binds `i` to cycle the idle-time limit, but the pull request description's key table lists only Space or `p`, `.`, `,`, `]` and `[`, and `web/src/plugins/replay/ReplayTab.test.tsx` exercises the idle control by clicking its button rather than by pressing the key. Severity: 3/10

Existing Risk: 3/10 - A chord the application claims and the documentation does not mention is invisible to the person who would rely on it and to the reviewer deciding whether the tab's key handling is reasonable.

Proposal Risk: 1/10 - A documented, tested chord that already works cannot regress by being written down.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1515: document and test the idle-limit chord". Add the `i` row to the key table in the recordings section of `documentation/user-documentation/advanced-agents/harness.md` and to the one in `documentation/user-documentation/tab-types/recording-player.md`, both of which list the same chords, and update the pull request description's key table to match. Add a case to `web/src/plugins/replay/ReplayTab.test.tsx` pressing `i` and asserting the idle control's label advances, alongside the existing case that clicks the same button — the two together pin that the chord and the control are the same action. Leave the chord's placement in the switch in `web/src/plugins/replay/ReplayTab.tsx` as it is, and note in that switch's comment that the idle chord is deliberately unshifted so it cannot collide with the terminal's own keys.