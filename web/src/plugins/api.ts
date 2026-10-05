import type { ReactNode } from 'react';
import type { JanusClient } from '../ws';
import { resourceUrl } from '../session-url';
import { copyText as systemCopyText } from '../shared/system-clipboard';
import { openTranscriptLink } from '../shared/transcript/open-link';
import { transcriptIntents } from '../shared/transcript/transcript-intents';
import type { PluginHost } from './host';

export { renderMarkdown } from '../shared/transcript/markdown';

// The host's command bar, published so a plugin whose tab takes a line of text renders the one the
// agent tab renders rather than a second textarea that drifts from it. Both are free of any feature:
// the shell is markup plus its autosize, the hook is the baseline keymap, and a plugin with keys of
// its own composes around them exactly as the agent tab does. Additive, so `TAB_PLUGIN_API_VERSION`
// does not move — that constant versions what a manifest must declare, which this does not change.
export { CommandBarShell, type CommandBarShellProperties } from '../shared/command-bar/CommandBarShell';
export { useCommandBarKeys, type CommandBarKeys } from '../shared/command-bar/useCommandBarKeys';
// The bar's caret insertion, published with it so a plugin splicing a picked line into its own bar
// keeps the same undo entry and caret placement the agent tab's bar does. The shell tab shipped a
// line-for-line copy of it before this. Additive, so `TAB_PLUGIN_API_VERSION` does not move.
export { spliceIntoTextarea } from '../shared/command-bar/textarea-splice';

// The application's own interception of a typed line, published beside the bar above and for the same
// reason: a plugin bar that offers every line to the server lets `quit` and a last-tab `close` tear the
// window down with nothing asked, because the interception that catches them lives in the agent tab's
// submit chain and a plugin bar never runs it. A plugin body asks this one question before it sends
// anything, and gets the same answer the agent tab's bar would give. What it reads is already bound to
// its own tab by the host: the line is intercepted as typed there, the queue popup's state arrives only
// while the popup is open over that tab, and a picked line is inserted into that tab's bar alone. The
// providers are the app shell's and are not published; `useAppCommandBar` throws without them rather
// than answering "nothing is intercepted".
export { useAppCommandBar } from '../shared/command-bar/AppCommandBar';
export type { AppCommandBar } from '../shared/command-bar/app-command-bar-scope';

// The host's "double-click to rename, Enter or blur to commit, Escape to cancel" field, published on
// the same terms and for the same reason: a plugin that renames something should rename it the way
// the tab strip and the file navigator already do.
export { InlineEditInput } from '../shared/InlineEditInput';

// The host's terse confirmation, published for the same reason and on the same terms: a plugin that
// asks the user to confirm something destructive should ask it the way the rest of the application
// does, with the same wording shape and the same keyboard contract. It shipped as two identical
// per-plugin copies before this, which is exactly the drift the published surface exists to prevent.
export { ConfirmDialog } from '../shared/ConfirmDialog';

// The two colors a terminal renders with, and the platform check that decides which modifier is the
// copy one. Published on the same terms as the components above: a plugin with its own terminal — the
// asciicast player — should read the app's colors rather than keep a second copy of the fallbacks that
// drifts from the stylesheet, and should reach for the same platform check, because getting that
// wrong breaks Cmd+C on exactly one platform and nowhere else to notice it.
export { terminalColors, type TerminalColors } from '../shared/terminal/colors';
export { copySelectionChord, isMacPlatform } from '../shared/terminal/terminal/keys';
export { PluginActionsHeader } from './PluginActionsHeader';

// The application's answer to "is this a place typed text can go", published for the same reason and
// on the same terms: a plugin that binds its own chords has to tell a field someone is typing into
// from everything else, and the asciicast player shipped its own copy of that test — which read every
// `<input>` as text entry and so treated the terminal's own hidden textarea, and the seek bar, as one.
// Published additively, so `TAB_PLUGIN_API_VERSION` does not move.
export { isTextEntryElement } from '../shared/text-entry';

// A connection's status glyph, and the three glyphs for the verbs that change one. Published for the
// same reason the dialog is: a remote tab's metadata row and the sessions tab both show the state of
// the same connections, and a plugin drawing its own icon for detach would be the drift this surface
// exists to prevent. Both are additive, so `TAB_PLUGIN_API_VERSION` does not move.
//
// The icons are published as the host's own icon objects rather than as `{ prefix, iconName }`
// descriptors. A descriptor carries no path data, so `FontAwesomeIcon` has to resolve it against a
// library the plugin cannot add to, and an unregistered name renders nothing at all — a control with
// no glyph and no size, which is invisible rather than obviously broken. `openFilesIcon` and
// `newTabIcon` are here for that reason: a metadata row of a plugin's own cannot draw its buttons.
export { ConnectionPlug, type ConnectionPlugState } from '../shared/ConnectionPlug';
export { detachSessionIcon, attachSessionIcon, terminateSessionIcon, workspacedIcon, connectionsWindowIcon, scheduleWindowIcon, openFilesIcon, newTabIcon } from '../shared/icons';

// The host's own floating status panels and the visibility hook that drives them, published for the
// same reason and on the same terms: a plugin whose tab offers the connections and schedule buttons
// must offer the windows the rest of the application shows, not a second pair of panels that drift
// from them. They take their rows as props rather than a whole `TabView` precisely so a plugin
// holding only its own payload can render them — the host pushes those rows into the payload when
// they change. Additive, so `TAB_PLUGIN_API_VERSION` does not move.
export { StatusPanels } from '../shared/status-windows/StatusPanels';
export {
  useStatusWindows,
  type StatusWindowHandlers,
  type StatusWindowOptions,
} from '../shared/status-windows/useStatusWindows';
// The two controls that open those windows, published with them for the same reason: a row offering
// the windows without the buttons to open them would compute rows it can never show. `statusButton`
// builds a button's props from a window's handlers and whether it has rows, which is the only pairing
// the host's own rows use.
export { StatusWindowButton } from '../shared/status-windows/StatusWindowButton';
export { statusButton, type StatusWindowButtonProps } from '../shared/status-windows/status-button';

// The bridge a terminal registers its selection with, which is the only way the application's own
// context menu learns what a right-click landed on: a terminal's selection is emulator state, so
// `globalThis.getSelection()` finds nothing and the menu cannot work it out for itself. Published so a
// plugin with its own terminal earns the same **Copy** entry the harness and takeover terminals get
// rather than shipping a menu of its own. Additive, so `TAB_PLUGIN_API_VERSION` does not move.
export {
  registerTerminalSelection,
  unregisterTerminalSelection,
} from '../shared/terminal/terminal/selection';

// The seam a plugin tab claims a keyboard chord through while it is the visible one. The declaration
// says which chords; the host's window handler asks this registry before its own table, so a claim
// applies exactly while the tab the user is looking at is on screen and reverts the moment focus moves.
// Published because the alternative is a plugin binding its own window listener, which cannot pre-empt
// the application's and would therefore never fire for a chord the application owns.
export { usePluginChordClaims, type PluginChordHandler } from './PluginChords';

// The arrow/Home/End selection rule for a list of records, published so every plugin list moves its
// current row the same way. The conversations, sessions, and schedules lists each carried their own
// identical copy before this, kept in step only by comments. Additive, so `TAB_PLUGIN_API_VERSION`
// does not move.
export { nextListSelection } from '../shared/list-selection';
export { HistoryPicker } from '../shared/command-bar/HistoryPicker';
export { handlePickerKey } from '../keyboard-handlers';

// The one clipboard writer, published so a plugin's copy reaches the same capture seam every other
// copy in the application does rather than being invisible to the clipboard history. The optional
// second argument is for the one plugin copy with something to say when the clipboard refuses;
// everything else stays silent, which is the shared writer's own behavior. Additive, so
// `TAB_PLUGIN_API_VERSION` does not move.
export { copyText } from '../shared/system-clipboard';

// The selection *state* behind that rule, for a plugin list whose rows arrive whole: which row is
// highlighted, which row the user confirmed, and the three rules that keep both inside a list the
// server has since rebuilt. Published on the same terms as `nextListSelection` — the two lists that
// drive a record selection kept an identical copy of this too, down to the scroll query. Additive, so
// `TAB_PLUGIN_API_VERSION` does not move.
export {
  useListSelection,
  type ListRowClick,
  type ListSelection,
} from '../shared/list-selection';

// A plugin tab's unsaved work, in the shape the host's close guard already reasons about (see
// `DirtyTabHandle`). A plugin may not refuse a host-initiated close itself, render its own modal
// over the app, or choose a host dialog's wording — it supplies these three answers and the host
// decides when to ask, which dialog to draw, and what each button does.
//
// `save` resolves only once the work is confirmed written, and rejects when it is not. That is not a
// way to refuse a close: the host still decides what a rejection means. It is how a plugin says the
// work is still unsaved, so the host keeps the tab rather than closing over it.
export type TabDirtyHandle = {
  isDirty(): boolean;
  save(): Promise<void>;
  focus(): void;
};

// One live terminal, attached for as long as the caller holds the handle. The bytes already travel
// the application's own `pty` channel — this is the fourth consumer of it rather than a fifth
// definition of one — so the plugin gains a terminal and no new transport.
export type PluginTerminal = {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  // Called once when the process behind this terminal has exited. A plugin holding a terminal whose
  // process is gone cannot tell: nothing on this side reports a death it did not witness.
  onExit(handler: () => void): void;
  detach(): void;
};

export type TabPluginClientCapabilities = {
  resourceUrl(reference: string): string;
  intent<Result>(name: string, payload: unknown): Promise<Result>;
  // A control the host rendered and this module only carries. The node is built one layer up, in the
  // component that already renders around the plugin, so this contract never imports a component of
  // its own — see `PluginBody`.
  splitAction: ReactNode;
  // Whether this plugin's tab is the visible one in its pane. A plugin tab stays mounted while
  // hidden — that is what preserves video playback and editor-style view state across tab switches —
  // so anything a plugin binds globally (a window key listener, say) has to consult this rather than
  // assume it is on screen. The host owns the answer; a plugin must never read it off the DOM.
  active: boolean;
  // This tab's own label, stable for as long as it is open. A plugin needs it wherever the host asks a
  // view to key per-tab state on something — `useStatusWindows` re-arms its auto-show when this
  // changes — and has no other way to learn it, since the capability object deliberately withholds the
  // client and a plugin must not read the DOM. Optional for the reason `attachTerminal` is: the host
  // always knows the label, but fourteen plugin fixtures build this object and none of them keys
  // anything by it. Absent means "no per-tab identity is available to you".
  label?: string;
  dotColor?: string;
  // Which sidebar this tab is docked into, or `null` when it sits in the centre strip. Placement is
  // host-owned, and a plugin that lays itself out differently in a narrow sidebar reads it here
  // rather than measuring the host's frame or sniffing its DOM.
  dock: 'left' | 'right' | null;
  // The chord ids this plugin's declaration claimed, as the host accepted them at activation and sends
  // them on this tab's view. Read them here rather than writing them out in the plugin: a second copy
  // is a second thing that can disagree with the claim actually enforced, and nothing would notice
  // when it did. Optional, like `attachTerminal`, so the plugin fixtures that build a capability
  // object are not churned for a field none of them claims; absent means the declaration claimed none.
  claimedChords?: readonly string[];
  // Close this tab. Unlike `splitAction` this is a callback rather than a host-rendered control,
  // because a plugin may need to close on something other than a click of its own button — an
  // embedded cross-origin page swallows the host's Cmd+W and has to answer for it itself.
  close(): void;
  // Register this tab's unsaved work with the host, or `null` to drop it. Optional so a plugin that
  // has nothing to save behaves exactly as it did before this existed. Call it again whenever the
  // answer to `isDirty` changes: re-registering is how the host learns, and it is what puts the
  // unsaved marker in the tab strip beside this tab's name.
  registerDirtyHandle?(handle: TabDirtyHandle | null): void;
  // Write text to the system clipboard through the same helper every other surface in the
  // application copies with, so a plugin does not carry a second implementation of it — a plugin
  // cannot reach that helper, and a lazily loaded chunk that grows its own would be a second place a
  // copy is observed and could drift.
  copyText(text: string): void;
  // Attach to a terminal this plugin's tab owns, by the id its payload carries, handing every byte it
  // produces to `onData`. Bytes already produced are flushed into `onData` before this returns, so a
  // plugin attaching late still renders what the shell said before it did. Returns a handle whose
  // `detach` releases the attachment; call it on teardown, or a hidden tab keeps a live subscription
  // to a terminal nothing is rendering. Optional, like `registerDirtyHandle`, because a plugin with no
  // terminal behaves exactly as it did before this existed.
  attachTerminal?(ptyId: string, onData: (data: string) => void): Promise<PluginTerminal>;
  // The two metadata-row actions that are tab-scoped RPCs rather than commands: open a file navigator
  // rooted at this tab, and launch an agent in this tab's directory. Capabilities rather than a
  // dispatched command line because the two are not the same thing — the agent action roots the new
  // tab at *this* tab's cwd and joins its group, which a command run in this tab does not. Optional
  // for the same reason as `attachTerminal`.
  openFileNavigator?(): void;
  launchAgentHere?(): void;
  // Open a link the way a click on it in an agent tab's transcript does: a web address through `open`,
  // a `path:line` reference in an editor tab, and anything else not at all. A plugin rendering markdown
  // of its own needs it because the default for an anchor click is to navigate the whole application
  // window away. Optional for the same reason as `attachTerminal`.
  openLink?(href: string): void;
  reportFailure(reason: string): void;
};

export function createPluginClientCapabilities(
  host: PluginHost,
  pluginId: string,
  label: string,
  client: JanusClient,
  active: boolean,
  dock: 'left' | 'right' | null,
  onClose: () => void,
  splitAction?: ReactNode,
  onDirtyHandle?: (handle: TabDirtyHandle | null) => void,
  claimedChords: readonly string[] = [],
  dotColor?: string,
): TabPluginClientCapabilities {
  return {
    active,
    dock,
    label,
    claimedChords,
    dotColor,
    close: onClose,
    registerDirtyHandle: onDirtyHandle,
    resourceUrl,
    copyText: (text: string) => { systemCopyText(text); },
    intent: async <Result,>(name: string, payload: unknown) => {
      const result = await client.request<Result>({
        method: 'pluginIntent',
        params: { tab: label, intent: name, payload },
      });
      if (!result.ok) throw new Error(`Plugin intent "${name}" failed`);
      return result.value;
    },
    splitAction: splitAction ?? null,
    attachTerminal: async (ptyId, onData) => {
      const authorization = await client.request<{ ok: boolean; value?: boolean }>({
        method: 'pluginTerminalAttach', params: { id: ptyId, tab: label },
      });
      if (!authorization.ok || !authorization.value) throw new Error('terminal does not belong to this plugin tab');
      const exitHandlers = new Set<() => void>();
      const stopListening = client.onPtyExit((id) => {
        if (id !== ptyId) return;
        for (const handler of exitHandlers) handler();
      });
      // Buffered early output is flushed into `onData` by `attachPty` before this returns, so a
      // plugin attaching late still renders whatever the shell said before it did.
      const detachBytes = client.attachPty(ptyId, onData);
      return {
        write: (data) => { client.send({ method: 'ptyInput', params: { id: ptyId, data, tab: label } }); },
        resize: (cols, rows) => { client.send({ method: 'ptyResize', params: { id: ptyId, cols, rows, tab: label } }); },
        onExit: (handler) => { exitHandlers.add(handler); },
        detach: () => { detachBytes(); stopListening(); exitHandlers.clear(); },
      };
    },
    openFileNavigator: () => { client.send({ method: 'openFileNavigatorFor', params: { label } }); },
    launchAgentHere: () => { client.send({ method: 'launchAgentFor', params: { label } }); },
    openLink: (href) => { openTranscriptLink(href, transcriptIntents((call) => client.send(call))); },
    // The report is deduplicated here rather than in the layer above, so the one-report-per-plugin
    // rule covers a plugin component reporting its own failure — a bad intent result, say — and not
    // just the load, schema, timeout, and render failures the host detects for it. The first report
    // disables the plugin for this session; the server then closes its tabs, and any later report
    // from a component still finishing its work is dropped instead of racing the teardown.
    reportFailure: (reason) => {
      if (!host.disable(pluginId, reason)) return;
      client.send({ method: 'pluginFailed', params: { tab: label, reason } });
    },
  };
}
