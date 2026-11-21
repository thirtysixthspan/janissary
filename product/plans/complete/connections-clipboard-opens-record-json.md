# Open the record JSON from the connections tab clipboard button

**Complexity: 5/10** — ~45 added lines across 10 production files, 3 requirements and 8 scenarios, 5 new functions (p=5.28)

## Goal

The clipboard icon in a connections record tab currently opens a point-in-time copy of the ACP session transcript, and appears only on records that carry an ACP session reference. It should instead open the record's own durable JSON file from `.janissary/connections/<id>.json` in an editor tab, and it should be available on every record because every retained record has such a file.

## Approach

Repurpose the existing clipboard button rather than adding a second control. Rename the client path from `open-transcript` to `open-record-json` end to end, and replace the server's transcript-snapshot topic action with one that opens the persisted record file through the same editor opener other file opens use. The record id already travels in the intent payload and is the file name, so no new wire shape or payload schema change is needed.

## Design decisions

1. **One button, changed behavior, not a second button.** The clipboard icon stays in the same position and keeps its `faClipboard` glyph. Only its accessible name, tooltip, action name, and the behavior behind it change. The separate snapshot buttons on connections popup rows are a different surface and keep their behavior.

2. **Show it on every record.** Every retained ACP or agent record is persisted as `.janissary/connections/<id>.json`, so the button no longer depends on `acpRef` being present. Agent and subagent records gain the button; the transcript-snapshot behavior they could never use goes away with it.

3. **The server owns the file path.** The plugin client never learns a filesystem path. A new connections topic action resolves the record id to a file through the ACP record store and opens it with the editor file opener. The existing `openAcpTranscript` helper stays in place for the core RPC and popup snapshots; only the plugin's use of it is removed.

4. **A missing file is a visible refusal, not a silent no-op.** If the id no longer names a row or the file is gone, the action returns a refusal string that the plugin surfaces on its tab. This mirrors the other record actions and keeps the button honest after a record is deleted out from under the tab.

## Implementation steps

1. `src/acp-records/store.ts`: make the path resolver public as `path(id)` (the existing private `file` logic), so the owning manager can hand out the persisted file location.
2. `src/acp-records/manager.ts`: add `filePath(id): string | undefined` on `AcpSessionRecords`, validating the id with `isRecordId` and delegating to the store's `path`.
3. `src/controller/connection-records.ts`: add `openRecordJson(managers, id): boolean` that resolves the file via `managers.acpRecords.filePath(id)`, checks it still exists, and opens it with `managers.openFile.edit`, naming the editor tab after the connection id and using the current tab as origin.
4. `src/plugins/api-topics-connections.ts`: replace the `transcript` action variant with `{ action: 'recordJson'; id: string }`.
5. `src/plugins/connections-topic-actions.ts`: replace `openRecordTranscript` with a handler for `recordJson` that checks the id names a record row, calls `openRecordJson`, and returns a refusal string when the row or file is missing. Drop the `openAcpTranscript` import.
6. `src/plugins/connections/activate.ts`: rename the `open-transcript` intent to `open-record-json`, drop the `acpRef !== undefined` requirement, and forward it to the `recordJson` topic action with the same id validation and refusal handling.
7. `src/plugins/connections/shared.ts`: replace the stale `open-transcript` entry in `ConnectionsIntent` with `{ intent: 'open-record-json'; payload: { id: string } }`.
8. `web/src/plugins/connections/useConnectionsController.ts`: rename `openTranscript` to `openRecordJson` and send the `open-record-json` intent in the `act` union.
9. `web/src/plugins/connections/ConnectionTab.tsx` and `ConnectionTabMeta.tsx`: rename the callback `onOpenTranscript` to `onOpenRecordJson`, keep the `faClipboard` icon but label it **Open record JSON**, set `data-action="open-record-json"`, and show it for every record rather than only those with `acpRef`. Update the comment that describes the controls.

## Tests

- `src/acp-records/store.test.ts`: assert `path(id)` returns the `.janissary/connections/<id>.json` location.
- `src/acp-records/manager.test.ts`: assert `filePath` returns the path for a valid id and `undefined` for a malformed id.
- `src/controller/connection-records.test.ts`: assert a live record's JSON file opens in an editor tab named after the id, and that a missing id or file refuses without opening.
- `src/plugins/connections-topic.test.ts`: replace the transcript-action cases with `recordJson` cases - opens a record's JSON, and refuses an unknown id or an id whose file is gone.
- `src/plugins/connections/activate.test.ts`: replace the open-transcript case with an open-record-json case that forwards to the `recordJson` topic action, validates the payload, and propagates a refusal; add a case showing a record without `acpRef` is accepted.
- `web/src/plugins/connections/ConnectionTab.test.tsx`: replace the two transcript-icon cases with the clipboard button labeled **Open record JSON** sending the `open-record-json` intent, now present on records without an ACP session.

## Specs and docs

- `product/specs/connections-tab.md`: the record tab's clipboard button opens the record's `.janissary/connections/<id>.json` file on every record; remove the ACP-reference-only and transcript-snapshot wording for this button, leaving the popup snapshot button untouched.
- `documentation/user-documentation/command-bar/connections.md`: same correction to the record tab's clipboard icon paragraph.

## Out of scope

- The transcript snapshot buttons on connections popup rows and the core `openAcpTranscript` RPC, which keep their behavior.
- New wire frames, commands, tabs, or a payload schema-version bump.
- Editing or reformatting the record JSON: opening it in an ordinary editor tab gives the user the raw file.
- The other pull-request backlog entries (fenced-block rendering in message fields and usage examples in the preamble).

## Verification

`$janissary/scripts/run.mjs check-diff` after each implementation step and after tests.
