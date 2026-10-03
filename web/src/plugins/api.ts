import type { ReactNode } from 'react';
import type { JanusClient } from '../ws';
import { resourceUrl } from '../session-url';
import { copyText as systemCopyText } from '../shared/system-clipboard';
import type { PluginHost } from './host';

export { renderMarkdown } from '../shared/transcript/markdown';

// The host's command bar, published so a plugin whose tab takes a line of text renders the one the
// agent tab renders rather than a second textarea that drifts from it. Both are free of any feature:
// the shell is markup plus its autosize, the hook is the baseline keymap, and a plugin with keys of
// its own composes around them exactly as the agent tab does. Additive, so `TAB_PLUGIN_API_VERSION`
// does not move — that constant versions what a manifest must declare, which this does not change.
export { CommandBarShell, type CommandBarShellProperties } from '../shared/command-bar/CommandBarShell';
export { useCommandBarKeys, type CommandBarKeys } from '../shared/command-bar/useCommandBarKeys';

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
export { isMacPlatform } from '../shared/terminal/terminal/keys';
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
export { ConnectionPlug, type ConnectionPlugState } from '../shared/ConnectionPlug';
export { detachSessionIcon, attachSessionIcon, terminateSessionIcon } from '../shared/icons';

// The arrow/Home/End selection rule for a list of records, published so every plugin list moves its
// current row the same way. The conversations, sessions, and schedules lists each carried their own
// identical copy before this, kept in step only by comments. Additive, so `TAB_PLUGIN_API_VERSION`
// does not move.
export { nextListSelection } from '../shared/list-selection';

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
  // Which sidebar this tab is docked into, or `null` when it sits in the centre strip. Placement is
  // host-owned, and a plugin that lays itself out differently in a narrow sidebar reads it here
  // rather than measuring the host's frame or sniffing its DOM.
  dock: 'left' | 'right' | null;
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
): TabPluginClientCapabilities {
  return {
    active,
    dock,
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
