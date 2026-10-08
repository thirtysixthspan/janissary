import { useMemo, useRef } from 'react';
import type { EditorPluginHost } from './editor/plugins/host';
import { createEditorPluginHost } from './editor/plugins/host';
import type { PluginReport } from './editor/plugins/useEditorPlugins';

// The editor-plugin host and the queue of disabled-plugin reports, built once per session at the
// edge that owns the editor tabs, the way `useOverlayPlugins` builds the overlay host.
//
// Disabling is session-scoped rather than per tab, so one host serves every open editor tab. The
// reports queue is its pair, because a plugin can be disabled at construction — before any tab has
// mounted to send one — and are drained by whichever tab is next to run or mount. The queue lives
// here rather than beside the host at module scope, so it comes into existence with the composition
// that owns the tabs and can be injected in a test instead of only reached through a default.
//
// The host holds no subscriptions, timers, or listeners, so there is nothing a dispose would
// release; its lifetime is the composition's.
export function useEditorPluginHost(): {
  host: EditorPluginHost;
  reports: PluginReport[];
} {
  const reports = useRef<PluginReport[]>([]).current;
  const host = useMemo(() => createEditorPluginHost((plugin, reason) => {
    reports.push({ plugin, reason });
  }), [reports]);
  return { host, reports };
}
