// Client -> server requests that belong to no single feature domain: tab lifecycle and ordering,
// the command queue, PTY streams, dialogs, and transcript openers. Composed into the shared
// `RpcCall` union by ../protocol.ts.
import type { AcpRef } from './tab.js';

// Tab creation/closing flow through `command` (`agent`, `close`); `setActiveTab`/`moveTab`/
// `toggleCollapse` are pure-UI shortcuts.
export type CoreRpcCall =
  | { method: 'init'; params: Record<string, never> }
  | { method: 'command'; params: { text: string } }
  | { method: 'setActiveTab'; params: { index: number } }
  | { method: 'focusTab'; params: { label: string } }
  | { method: 'closeTab'; params: { index: number } }
  | { method: 'renameTab'; params: { index: number; title: string } }
  // Patch or remove one entry in the active tab's command queue (see `queue.md`). Index-based
  // against that tab's queue; no-ops server-side when the index is out of range.
  | { method: 'editQueuedCommand'; params: { index: number; text: string } }
  | { method: 'deleteQueuedCommand'; params: { index: number } }
  | { method: 'moveTab'; params: { dir: -1 | 1 } }
  | { method: 'moveTabToOtherPane'; params: { index: number } }
  | { method: 'reorderTab'; params: { dir: -1 | 1 } }
  | { method: 'reorderTabTo'; params: { from: number; to: number } }
  | { method: 'toggleCollapse'; params: Record<string, never> }
  | { method: 'chooseRoute'; params: { index: number } }
  // Close the "New harness" launch dialog without launching (Cancel/Escape).
  | { method: 'closeHarnessLaunch'; params: Record<string, never> }
  | { method: 'answerQuestion'; params: { tab: string; id: string; answer: string | null } }
  | { method: 'complete'; params: { text: string; cursor: number } }
  | { method: 'resize'; params: { cols: number; rows: number } }
  | { method: 'ptyInput'; params: { id: string; data: string } }
  | { method: 'ptyResize'; params: { id: string; cols: number; rows: number } }
  | { method: 'ptyKill'; params: { id: string } }
  // Report the client's current sidebar/tab-area sizes after a manual resize completes, so the
  // server always holds the latest values for `profile save` to read synchronously into a profile's
  // `layout` key. Client-only, no reply — the reverse of the server->client `layout` event.
  | { method: 'reportLayout'; params: { sidebarLeft: number; sidebarRight: number; tabAreaPct: number } }
  // Dock a dockable tab (file navigator or notifications) into a sidebar (`'left'` | `'right'`), or
  // undock it back to the center tab strip (`null`). Explicit set, not "cycle" — the cycle order
  // lives client-side. The handler is generic, so both dockable tab kinds share this one RPC.
  | { method: 'setDock'; params: { index: number; dock: 'left' | 'right' | null } }
  // Launch a new agent tab whose working directory is the named tab's cwd, triggered by the ➕
  // button in a harness/agent tab's metadata row. The new agent is auto-named from the pool, joins
  // the source tab's group, and is focused. `label` is the requesting tab's own label.
  | { method: 'launchAgentFor'; params: { label: string } }
  // Write the named agent tab's full transcript to a plain-text file and open it in an editor
  // tab, triggered by the clipboard button in an agent tab's metadata row. No-ops when the tab
  // is missing or its log is empty. `label` is the requesting tab's own label.
  | { method: 'openTranscriptFor'; params: { label: string } }
  // Open the named harness tab's session transcript file (the same file `harness transcript`
  // opens) in an editor tab, triggered by the clipboard button in a harness tab's metadata row.
  // No-ops when the tab has no transcript tailer or no transcript file yet. `label` is the
  // requesting harness tab's own label.
  | { method: 'openHarnessTranscriptFor'; params: { label: string } }
  // Write the ACP session identified by `acpRef` to a plain-text capture file and open it in a
  // read-only editor tab, triggered by the clipboard button on a connections-panel ACP row. An
  // empty exchange substitutes a `No transcript yet.` placeholder rather than no-opping.
  | { method: 'openAcpTranscript'; params: { acpRef: AcpRef } }
  // List every gitignore-aware file under the project/launch directory, for the Cmd+P quick-open
  // overlay. Replies (deferred) with `{ root, paths }` — `root` is the absolute launch directory,
  // `paths` are its root-relative paths — so the client can join them into an absolute path for
  // the `edit` command regardless of the active tab's own cwd.
  | { method: 'projectFiles'; params: Record<string, never> };
