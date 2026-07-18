# Clipboard icon in the agent tab metadata row: open the transcript in an editor tab

**Complexity: 4/10** — a new client→server RPC threaded through the standard protocol/message-handler/controller chain (mirroring the existing `openFileNavigatorFor` metadata-row button), a small pure transcript-to-text helper, and reuse of the existing capture-file + editor-open pattern already used by the monitor context snapshot and harness screen capture.

## Goal

Per the backlog: "add fa-regular fa-clipboard clipboard icon to the agent tab metadata row that when clicked will open the transcript for that agent in an editor tab." `web/src/AgentTabMeta.tsx` currently has a file-navigator button and a launch-agent button, right-aligned; this adds a third, clipboard-icon button that writes the tab's transcript to a text file and opens it in an editor tab (same mechanism the auto-approve capture link and the monitor context snapshot already use).

## Background (verified)

- `src/types.ts:10-30` `LogEntry = { input, output, running?, cwd?, from?, fromColor?, msgKind?, acp?, markdown?, terminal?, openFile? }`; a tab's full history is `Tab.log: LogEntry[]`.
- `src/monitor/context.ts` `snapshotMonitorContext` is the closest existing precedent: it joins accumulated text blocks, writes them via `writeCaptureFile` (`src/harness/capture-file.ts`), then opens the result via `managers.openFile.edit(command, file, label)`. No-ops when there's nothing to write.
- `src/controller-file-tree.ts` `openFileNavigatorFor(managers, label)` is the structural precedent for a metadata-row button's server-side handler: a small standalone function taking `Managers` and the tab's `label`, wired through `controller.ts` → `message-handler.ts` → `protocol.ts`'s `RpcCall` union, dispatched from the client with `client.send({ method: '...', params: { label: current.label } })` (see `AgentTabBody.tsx:89`, the file-navigator button's exact wiring).
- `web/src/icons.ts` already exports `viewCaptureIcon` as the **regular** `faClipboard` (added for the "move the clipboard icon" fix) — exactly the `fa-regular fa-clipboard` icon this issue asks for, reusable as-is.
- `src/controller.ts` (267 significant-ish lines) and `src/message-handler.ts` (91 lines) both have headroom under the 200-significant-line limit for one more small method/case each; the transcript-to-text logic and the file-write/open logic go in new small modules, not inline in `controller.ts`, mirroring `controller-file-tree.ts`.

## Approach

1. A pure `src/tab/transcript-text.ts` helper renders a tab's `LogEntry[]` as plain text: each entry's input (prefixed `> `) followed by its output, blank-line separated between entries — the same "input, then output" shape `monitor/framing.ts`'s `frameEntry` already uses for a single entry, just without the security delimiter (this isn't crossing a trust boundary).
2. A new `src/controller-transcript.ts` (mirroring `controller-file-tree.ts`) exposes `openTranscriptFor(managers, label)`: find the tab, no-op if missing or its log is empty, otherwise render the text, write it via `writeCaptureFile`, and open it via `managers.openFile.edit`.
3. Wire a `openTranscriptFor` RPC end to end (protocol/message-handler/controller), and a clipboard-icon button in `AgentTabMeta.tsx` alongside the existing file-navigator/launch-agent buttons.

## Implementation steps

1. **`src/tab/transcript-text.ts`** (new file):
   ```ts
   import type { LogEntry } from '../types.js';

   // Plain-text rendering of a tab's transcript for the "open transcript" clipboard-icon
   // affordance: each entry's input (prefixed like a prompt) followed by its output, blank-line
   // separated. Mirrors monitor/framing.ts's single-entry framing, without its security delimiter
   // (this text never crosses back into a model prompt).
   export function transcriptText(log: readonly LogEntry[]): string {
     return log
       .map((entry) => [entry.input && `> ${entry.input}`, entry.output].filter(Boolean).join('\n'))
       .filter(Boolean)
       .join('\n\n');
   }
   ```
2. **`src/controller-transcript.ts`** (new file):
   ```ts
   import type { Managers } from './managers.js';
   import { writeCaptureFile } from './harness/capture-file.js';
   import { transcriptText } from './tab/transcript-text.js';

   // Open the named tab's full transcript as a plain-text snapshot in an editor tab — the
   // clipboard metadata-row button (see AgentTabMeta.tsx).
   export function openTranscriptFor(managers: Managers, label: string): void {
     const tab = managers.tab.tabs.find((t) => t.label === label);
     if (!tab || tab.log.length === 0) return;
     const file = writeCaptureFile(label, Date.now(), transcriptText(tab.log));
     managers.openFile.edit(`transcript ${label}`, file, label);
   }
   ```
3. **`src/protocol.ts`** — add to `RpcCall`, alongside `openFileNavigatorFor`:
   ```ts
   | { method: 'openTranscriptFor'; params: { label: string } }
   ```
4. **`src/message-handler.ts`** — `src/controller.ts` is already at its 200-significant-line limit (confirmed by running `check-diff` after adding a `controller.ts` passthrough method — it failed `max-lines`). Rather than compacting existing code to make room (forbidden by `ai/guidelines/code-guidelines.md`), skip the usual `Controller` passthrough for this one RPC: `message-handler.ts` imports `openTranscriptFor` from `./controller-transcript.js` directly and calls it with `controller.managers`, the same `Managers` instance a `Controller` passthrough would have forwarded:
   ```ts
   import { openTranscriptFor } from './controller-transcript.js';
   // ...
   case 'openTranscriptFor': { openTranscriptFor(controller.managers, message.params.label); break; }
   ```
   `Controller.managers` is already a public field read throughout `controller.ts` itself and already present in `message-handler.test.ts`'s controller stub, so this doesn't require exposing anything new — it only skips one redundant one-line forwarding method that had nowhere left to go. Every other case keeps routing through `controller.<method>` unchanged.
6. **`web/src/AgentTabMeta.tsx`** — add an `onOpenTranscript?: () => void` prop and a `tab-open-transcript` button using `viewCaptureIcon` (already the regular clipboard glyph), placed among the existing metadata-row buttons:
   ```tsx
   {onOpenTranscript && (
     <button type="button" className="tab-open-transcript" title="Open transcript" aria-label="Open transcript" onClick={onOpenTranscript}>
       <FontAwesomeIcon icon={viewCaptureIcon} />
     </button>
   )}
   ```
7. **`web/src/AgentTabBody.tsx`** — wire the new prop, mirroring `onOpenFileNavigator`:
   ```tsx
   onOpenTranscript={() => client.send({ method: 'openTranscriptFor', params: { label: current.label } })}
   ```
8. **`web/src/theme.css`** — add a `.tab-open-transcript` rule mirroring `.tab-open-files`/`.tab-launch-agent` (transparent background, `var(--muted)` color, `var(--fg)` on hover).

## Tests

**Server:**
- `src/tab/transcript-text.test.ts` (new):
  ```ts
  import { describe, expect, it } from 'vitest';
  import { transcriptText } from './transcript-text.js';

  describe('transcriptText', () => {
    it('joins input and output per entry, blank-line separated', () => {
      const log = [{ input: 'npm test', output: '1 failing' }, { input: '', output: 'idle' }];
      expect(transcriptText(log)).toBe('> npm test\n1 failing\n\nidle');
    });
    it('returns an empty string for an empty log', () => {
      expect(transcriptText([])).toBe('');
    });
  });
  ```
- `src/controller-transcript.test.ts` (new), mirroring `controller-file-tree.ts`'s existing test style: asserts `openTranscriptFor` writes a capture file and calls `managers.openFile.edit` for a tab with log entries, and no-ops for a missing tab or one with an empty log.
- `src/message-handler.test.ts`: mock `./controller-transcript.js` and add a `'routes openTranscriptFor to controller-transcript.js with the controller's managers'` case asserting the mocked function is called with `(controller.managers, 'janus')`.

**Web:**
- `web/src/AgentTabMeta.test.tsx` (or wherever `AgentTabMeta`'s existing button tests live — check first): add a case asserting the transcript button renders only when `onOpenTranscript` is provided, and that clicking it invokes the callback (mirroring the file-navigator button's existing test, if one exists — otherwise add a small `describe` block following that file's conventions).

Run `./scripts/run.mjs check-diff` after implementing.

## Spec updates

- `product/specs/tabs.md:97-102` documents the file-navigator and launch-agent metadata-row buttons, both shown on agent **and harness** tabs. This fix is scoped to the issue's literal wording — "the agent tab metadata row" — so the new clipboard button appears on `AgentTabBody.tsx` only, not `HarnessTab.tsx`. Add a paragraph after the launch-agent one describing it: agent tabs (not harness tabs) also show a clipboard-icon button that writes the tab's full transcript to a plain-text file and opens it in an editor tab, mirroring the existing screen-capture/context-snapshot affordances elsewhere in the app (harness screen capture, monitor context snapshot).

## Docs

- Checked `help.md` and `documentation/user-documentation/` for any description of the agent tab metadata row's buttons — none found describing the file-navigator/launch-agent buttons either, so this is undocumented territory; per Step 6, new behavior that wasn't previously documented is out of scope for documentation. No doc update needed.

## Out of scope

- Reusing the web renderer's ANSI-stripping/markdown/tool-step-collapsing logic (`flattenBuffer`) to produce a byte-for-byte match of what's on screen — the plain `input`/`output` join is a deliberately simple, good-enough transcript export, consistent with how `monitor/framing.ts` already frames entries without that processing.
- Any change to the harness capture (`harness capture <name>`) or monitor context snapshot features — this is a new, separate capture path for an ordinary agent tab's own transcript.
