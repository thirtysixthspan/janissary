import type { ReactNode } from 'react';
import type { JanusClient } from '../ws';
import type { PluginHost } from './host';

export { renderMarkdown } from './markdown-render';

// A plugin tab's unsaved work, in the shape the host's close guard already reasons about (see
// `DirtyTabHandle`). A plugin may not refuse a host-initiated close itself, render its own modal
// over the app, or choose a host dialog's wording — it supplies these three answers and the host
// decides when to ask, which dialog to draw, and what each button does.
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
    resourceUrl: (reference) => {
      const token = new URLSearchParams(location.search).get('token') ?? '';
      return `${reference}?token=${encodeURIComponent(token)}`;
    },
    intent: async <Result,>(name: string, payload: unknown) => {
      const result = await client.request<Result>({
        method: 'pluginIntent',
        params: { tab: label, intent: name, payload },
      });
      if (result === undefined) throw new Error(`Plugin intent "${name}" failed`);
      return result;
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
