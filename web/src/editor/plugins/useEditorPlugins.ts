// Wires the plugin host into one editor tab: matches a keydown the core table left unbound against
// the chord table, hands the declared slice to the plugin, and applies what comes back as a single
// undo step. Reports a disabled plugin to the server so the failure reaches the notifications tab.

import { useEffect } from 'react';
import type { JanusClient } from '../../ws';
import type { KeyLike } from '../keys';
import type { EditorState } from '../model';
import { allSelections, selectionRange } from '../model';
import type { EditorApi } from '../useEditor';
import type { BoundBinding, EditorPluginRequest, EditorRange } from './api';
import { applyPluginResult } from './apply-edits';
import { matchBinding } from './chords';
import { createEditorPluginHost, type EditorPluginHost } from './host';

// Disabling is session-scoped rather than per tab, so the host is created once for the page and
// shared by every open editor tab. Reports queue here because a plugin can be disabled at
// construction — before any tab has mounted to send one — and are drained by whichever tab is next
// to run or mount.
export type PluginReport = { plugin: string; reason: string };

const pendingReports: PluginReport[] = [];

const sessionHost = createEditorPluginHost((plugin, reason) => {
  pendingReports.push({ plugin, reason });
});

function wholeBuffer(state: EditorState): EditorRange {
  const last = state.lines.length - 1;
  return { start: { line: 0, col: 0 }, end: { line: last, col: state.lines[last].length } };
}

// A `selection` binding gets the whole lines the selection covers, and the caret's line when nothing
// is selected — so the slice is never empty and a plugin never has to special-case "no selection".
function selectedLines(state: EditorState): EditorRange {
  const bounds = selectionRange(state) ?? { start: state.cursor, end: state.cursor };
  const endLine = bounds.end.line;
  return {
    start: { line: bounds.start.line, col: 0 },
    end: { line: endLine, col: state.lines[endLine].length },
  };
}

function requestFor(
  state: EditorState, binding: BoundBinding, file: string,
): EditorPluginRequest {
  const range = binding.needs === 'buffer' ? wholeBuffer(state) : selectedLines(state);
  return {
    command: binding.command,
    file,
    selections: allSelections(state).map(({ anchor, cursor }) => ({ anchor, cursor })),
    range,
    lines: state.lines.slice(range.start.line, range.end.line + 1),
  };
}

export function useEditorPlugins(
  client: JanusClient,
  url: string,
  api: EditorApi,
  file: string,
  host: EditorPluginHost = sessionHost,
  reports: PluginReport[] = pendingReports,
): (event: KeyLike) => boolean {
  const report = () => {
    const queued = [...reports];
    reports.length = 0;
    for (const entry of queued) {
      client.send({
        method: 'editorPluginFailed',
        params: { url, plugin: entry.plugin, reason: entry.reason },
      });
    }
  };

  useEffect(report);

  const dispatch = async (binding: BoundBinding): Promise<void> => {
    const before = api.stateRef.current;
    if (!before) return;

    const outcome = await host.run(binding, requestFor(before, binding, file));
    if (outcome.status === 'failed') { report(); return; }
    if (!outcome.result) return;

    const current = api.stateRef.current;
    if (!current) return;
    const applied = applyPluginResult(current, outcome.result);
    if (!applied.ok) {
      host.disable(binding.plugin, applied.reason);
      report();
      return;
    }
    api.replace(applied.state);
  };

  // Answers synchronously so the caller can preventDefault before the handler's own work begins.
  return (event: KeyLike): boolean => {
    const binding = matchBinding(host.bindings(), event);
    if (!binding) return false;
    void dispatch(binding);
    return true;
  };
}
