import type { TabActivityEntry } from '../api.js';
import type { LauncherCommand, LauncherPayload, LauncherTabRow } from './shared.js';
import { isLauncherOwn } from './shared.js';

// What the launcher's single tab holds beyond its payload, in module state because there is exactly
// one launcher for the life of the server. The summaries are the ACP-written paragraphs keyed by
// label; `rows` is the last set published, which is what an unchanged republish is dropped against;
// `publishedConfig` is the command half as last published, for the same reason.
export type LauncherState = {
  rows: LauncherTabRow[] | null;
  summaries: Record<string, string>;
  commands: LauncherCommand[];
  source: LauncherPayload['source'];
  filePath: string;
  problem?: string;
  reported: boolean;
  publishedConfig?: string;
};

export function initialState(): LauncherState {
  return {
    rows: null,
    summaries: {},
    commands: [],
    source: 'default',
    filePath: '',
    reported: false,
    publishedConfig: undefined,
  };
}

// The rows the launcher shows: every open centre tab, with the docked dropped and so are the launcher's
// own. The docked are dropped here rather than on the client because the rule is a property of what a
// row can do — a docked tab can never be focused from here — and the payload is the one place that rule
// lives. The launcher's own tabs are dropped here because this projection is also what the `tabs`
// topic's rows go through, and a dock check would not catch one that had been undocked.
//
// A row also drops the transcript tail a summarizer needs but a row does not draw: what crosses the
// wire is what the rail shows and what its hover card adds, never another tab's content.
export function toRows(tabs: readonly TabActivityEntry[], activeLabel?: string): LauncherTabRow[] {
  return tabs
    .filter((tab) => tab.dock === undefined && !isLauncherOwn(tab))
    .map((tab) => ({
      label: tab.label,
      ...(tab.title !== undefined && { title: tab.title }),
      dotColor: tab.dotColor,
      active: activeLabel === tab.label,
      ...(tab.view !== undefined && { view: tab.view }),
      ...(tab.pane !== undefined && { pane: tab.pane }),
      busy: tab.busy,
      hasUnread: tab.hasUnread,
      needsInput: tab.needsInput,
      lastActivity: tab.lastActivity,
      cwd: tab.cwd,
      ...(tab.remote !== undefined && { remote: tab.remote }),
      ...(tab.lastCommand !== undefined && { lastCommand: tab.lastCommand }),
    }));
}

// The payload as the current state has it. Kept in one place so a republish from the command, from
// the topic, and from a summarizer reply all produce the same shape.
export function payloadOf(state: LauncherState, rows: LauncherTabRow[]): LauncherPayload {
  return {
    commands: state.commands,
    tabs: rows,
    summaries: state.summaries,
    source: state.source,
    filePath: state.filePath,
    ...(state.problem !== undefined && { problem: state.problem }),
  };
}

// The command half of the state as one fingerprint: the rail, the file it came from, whether one was
// in effect at all, and what the host had to say about it. It is published beside the rows rather than
// inside them, because editing `launcher.json` and typing `launcher` again moves this half and not one
// row — and a republish that asks only about rows leaves the rail showing the file as it was.
export function configFingerprint(state: LauncherState): string {
  return JSON.stringify([state.commands, state.source, state.filePath, state.problem ?? null]);
}

// Whether these rows differ from the last set published. The comparison is by value, which is what
// the `tabs` topic's handler needs: a per-mutation signal must not become a per-mutation broadcast,
// and the only honest way to tell is to ask whether anything actually changed.
export function rowsChanged(state: LauncherState, rows: LauncherTabRow[]): boolean {
  if (state.rows === null) return true;
  return JSON.stringify(rows) !== JSON.stringify(state.rows);
}

// Whether publishing would change what the tab shows: the rows have moved, or the command
// configuration behind them has. Either half alone is not the whole payload.
export function payloadChanged(state: LauncherState, rows: LauncherTabRow[]): boolean {
  return rowsChanged(state, rows) || state.publishedConfig !== configFingerprint(state);
}
