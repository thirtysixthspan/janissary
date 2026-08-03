import React from 'react';
import type { JanusClient } from '../ws';
import { SplitTabButton } from '../SplitTabButton';
import { disableClientPlugin } from './registry';

export type TabPluginClientCapabilities = {
  resourceUrl(reference: string): string;
  intent<Result>(name: string, payload: unknown): Promise<Result>;
  splitAction: React.ReactNode;
  // Whether this plugin's tab is the visible one in its pane. A plugin tab stays mounted while
  // hidden — that is what preserves video playback and editor-style view state across tab switches —
  // so anything a plugin binds globally (a window key listener, say) has to consult this rather than
  // assume it is on screen. The host owns the answer; a plugin must never read it off the DOM.
  active: boolean;
  reportFailure(reason: string): void;
};

export function createPluginClientCapabilities(
  pluginId: string,
  label: string,
  client: JanusClient,
  active: boolean,
  onSplit?: () => void,
): TabPluginClientCapabilities {
  return {
    active,
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
    splitAction: onSplit ? React.createElement(SplitTabButton, { onClick: onSplit }) : null,
    // The report is deduplicated here rather than in the layer above, so the one-report-per-plugin
    // rule covers a plugin component reporting its own failure — a bad intent result, say — and not
    // just the load, schema, timeout, and render failures the host detects for it. The first report
    // disables the plugin for this session; the server then closes its tabs, and any later report
    // from a component still finishing its work is dropped instead of racing the teardown.
    reportFailure: (reason) => {
      if (!disableClientPlugin(pluginId, reason)) return;
      client.send({ method: 'pluginFailed', params: { tab: label, reason } });
    },
  };
}
