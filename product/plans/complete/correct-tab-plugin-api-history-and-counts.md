# Correct the tab-plugin API history and counts

**Complexity: 2/10** — documentation, one functional spec, and one documentation test. No runtime code changes.

## Goal

Make the tab-plugin reference and its functional spec tell the historical truth: API v2 shipped with twenty-seven client members and the deprecated `launchShellHere()` compatibility capability, and did not include `openConnection(row)` or the optional background-reply `line`. Those two additions belong to API v3, whose current contract has forty-eight server and twenty-seven client capabilities.

## Approach

The stale text entered the reference alongside the async shell-reply and connection-tab work, which was written while the branch still declared API v2. The later breaking release bumped the API to v3, removed the ACP response panel and `launchShellHere()`, and added `openConnection` and the optional reply `line`. Because API v2 is the last released contract, an addition that never shipped in a v2 release is a v3 addition, not a v2 one.

The reference keeps its historical v2 section as the released contract: twenty-seven client capabilities, `launchShellHere()` present, `onBackgroundReply` with stable IDs and output only, and no connection-opening or reply-line text. The bogus "Twenty-eight client capabilities" bullet goes away. The two moved additions are recorded in the v3 changelog and in the v3 migration guidance. The functional spec moves the same two sentences from its API version 2 section to API version 3, leaving v2 describing only its historical additions.

`src/plugins/documentation.test.ts` already pins the v3 count phrase. Extend it to pin the historical v2 surface too: no `openConnection`, no optional reply `line`, no twenty-eight-member claim, `launchShellHere()` still mentioned, and the current forty-eight server / twenty-seven client count phrase only in the v3 section.

## Implementation steps

1. In `documentation/developer-documentation/tab-plugins.md`, remove the `openConnection(row)` and optional reply `line` sentences from the v2 paragraph, keeping `onBackgroundReply` and its stable `id`/`output` fields. Remove the "Twenty-eight client capabilities" bullet and reword the surviving v2 count bullet to twenty-seven client capabilities so the current server/client pair appears only in v3. Add a v3 changelog bullet describing both additions and mention `openConnection(row)` in the v3 migration bullet.
2. In `product/specs/tab-plugins.md`, move the optional reply `line` and `openConnection(row)` sentences from "API version 2" to "API version 3"; leave v2 with only its historical additions and current launch-shell deprecation note.
3. Extend `src/plugins/documentation.test.ts` with the v2 historical-surface assertions and an exclusivity check that the current forty-eight server / twenty-seven client phrase occurs only in the v3 section.
4. Run the documentation test and `$janissary/scripts/run.mjs check-diff`.

## Tests

- `src/plugins/documentation.test.ts`: assert the v2 section does not contain `openConnection`, `optional \`line\``, or `Twenty-eight`; assert it contains `Twenty-seven client capabilities` and `launchShellHere()`; assert the current count phrase occurs exactly once in the document, inside the v3 section.
- Run `npx vitest run --project server src/plugins/documentation.test.ts`.
- Run `$janissary/scripts/run.mjs check-diff`.

## Out of scope

- Any source, client capability object, or runtime behavior change.
- `product/specs/tab-plugins.md` sections other than the API version history.
- `ai/guidelines/plugins-tabs.md`, which already describes the current contract without a stale history.
- The other backlog entry in `product/backlog/pull-request.md`.
