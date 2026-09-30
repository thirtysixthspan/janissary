# Report an Uncompilable Search Regex

**Complexity: 3/10** — one pure helper beside the matcher, an early return in the search session, one capability added to the search manifest, tests, and a spec sentence. No wire, host, or client change.

## Goal

With the regular expression toggle on, a query that will not compile, such as `[unclosed`, should be reported rather than answered. Today it settles as `No matches found for "[unclosed".` and nothing reaches any transcript, though the spec says it "is reported on the transcript the search was started from, and the search tab keeps working". A user who mistypes a pattern is told the project has no matches instead of being told the pattern is broken.

## Approach

`compileMatcher` in `src/plugins/search/compile-matcher.ts` swallows the engine's `SyntaxError` and returns `null`, which is also its answer for an empty or zero-width pattern. `run` in `scan.ts` then treats `null` as a finished search with no rows. The two refusals need telling apart before a scan starts.

A new pure `patternError(query, modes)` beside the matcher returns the engine's message when regex mode is on and the query will not compile, and `null` otherwise. It compiles the user's own pattern with the same flags, not the whole-word wrapper, so the message names what the user typed rather than the lookarounds the plugin adds. A plain-text query never fails, because it is escaped.

`SearchSession.run` checks it first. For an uncompilable pattern it cancels any scan in flight, starts none, publishes the tab in its existing `error` state with the message (the body already renders a failed search's reason, so the tab says why instead of claiming no matches), and calls `note` with the same message. The session holds the capabilities of whichever call built it, so `run` takes the calling request's own capabilities for the note: an intent's capabilities carry the tab's source label as their origin, which is exactly "the transcript the search was started from". The plugin stays active, because a mistyped pattern is the user's input, not a broken plugin, and the next valid search runs normally.

The search manifest gains `note`, since reaching a transcript through an undeclared capability disables a plugin.

Rejected: answering with `rejectRequest`. For an intent a rejection becomes an RPC error to the client, which ignores the result of a search intent, so nothing would reach the transcript and the tab would stay in its previous state.

## Implementation steps

1. **Detect.** In `src/plugins/search/compile-matcher.ts`, export `patternError(query, modes): string | null`.
2. **Report.** In `src/plugins/search/session.ts`, give `run` an optional `reporter` argument defaulting to the session's own capabilities. After remembering the modes and cancelling the scan, when `patternError` answers, publish `{ ...request, state: 'error', message, rows: [] }`, call `reporter.note(message)`, and return.
3. **Wire.** In `src/plugins/search/activate.ts`, pass the intent's capabilities to `run`. Add `note` to `src/plugins/search/manifest.ts`.

## Tests

- `src/plugins/search/compile-matcher.test.ts`: `patternError` returns the engine's message for `[unclosed` in regex mode, including with whole word on, where the message names `[unclosed` and not the wrapper; it returns `null` for the same text in plain-text mode, for a valid regex, and for an empty query.
- `src/plugins/search/activate.test.ts`: a `search` intent with `regex: true` and `[unclosed` never calls `projectFileList`, publishes `state: 'error'` with a message containing `Invalid regular expression`, and notes that message through the intent's capabilities; a valid search afterwards settles as done with rows.

## Spec

`product/specs/search-tab.md`, the regular expression toggle: a pattern that will not compile starts no search, the tab shows why in its body, and the same reason is written to the transcript the search tab was opened from.

## Out of scope

- Showing the error inline in the search bar as the user types.
- The other entries in the pull request's backlog.
