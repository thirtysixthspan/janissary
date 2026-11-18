import type { IMarker, Terminal } from '@xterm/xterm';
import type { TabPluginClientCapabilities } from '../api';
import type { ShellAcpReceipt, ShellConnectionRow } from '@shared/plugins/shell/shared';
import { addThinkingMarker, type ThinkingMarkerHandle, type ThinkingMarkerView } from './thinking-marker-decoration';

type BackgroundReceiver = Parameters<NonNullable<TabPluginClientCapabilities['onBackgroundReply']>>[0];
type BackgroundReply = Parameters<BackgroundReceiver>[0];
type PendingReceiver = Parameters<NonNullable<TabPluginClientCapabilities['onPendingAcpReplyName']>>[0];
type PendingAcpReplyNameView = Parameters<PendingReceiver>[0];

export type PendingNameUpdate = PendingAcpReplyNameView & { pending: true };

type ReplyRecord = NonNullable<BackgroundReply['record']>;

type Settlement =
  | { kind: 'pending' }
  | { kind: 'link'; record: ReplyRecord }
  | { kind: 'none' };

type RoleReceipt = Extract<ShellAcpReceipt, { role: 'ask' | 'tell' }>;

type MarkerTarget = { role: RoleReceipt['role'] } | { recordId: string };

type Entry = {
  target: MarkerTarget;
  name: string;
  handle: ThinkingMarkerHandle | undefined;
  settlement: Settlement;
};

export type ReplyMarkers = { entries: Map<string, Entry>; pendingNames?: Map<string, string> };

export function createReplyMarkers(): ReplyMarkers {
  return { entries: new Map() };
}

export type Opening = {
  openConnection: React.RefObject<((row: ShellConnectionRow) => void) | undefined>;
  label: React.RefObject<string | undefined>;
};

type Draw = (marker: IMarker) => void;

function runningView(entry: Entry, opening: Opening): ThinkingMarkerView {
  return {
    kind: 'running',
    name: entry.name,
    onOpen: () => {
      if ('recordId' in entry.target) {
        opening.openConnection.current?.({ text: entry.name, kind: 'acp', recordId: entry.target.recordId });
        return;
      }
      const open = opening.openConnection.current;
      const label = opening.label.current;
      if (!open || !label) return;
      open({ text: entry.name, kind: 'acp', acpRef: { scope: 'tab', label, role: entry.target.role } });
    },
  };
}

function linkView(record: ReplyRecord, opening: Opening): ThinkingMarkerView {
  return {
    kind: 'link',
    name: record.name,
    onOpen: () => { opening.openConnection.current?.({ text: record.name, kind: 'acp', recordId: record.id }); },
  };
}

export function drawEcho(terminal: Terminal, entry: Entry, opening: Opening): Draw {
  return (marker) => {
    const { settlement } = entry;
    if (settlement.kind === 'pending') entry.handle = addThinkingMarker(terminal, marker, runningView(entry, opening));
    else if (settlement.kind === 'link') addThinkingMarker(terminal, marker, linkView(settlement.record, opening));
    else marker.dispose();
  };
}

function drawLink(terminal: Terminal, record: ReplyRecord, opening: Opening): Draw {
  return (marker) => { addThinkingMarker(terminal, marker, linkView(record, opening)); };
}

export function begin(
  state: ReplyMarkers, replyIds: Set<string>, receipt: ShellAcpReceipt,
): Entry | undefined {
  const { replyId } = receipt;
  if (state.entries.has(replyId) || replyIds.has(replyId)) return undefined;
  const name = state.pendingNames?.get(replyId) ?? receipt.name;
  clearPendingName(state, replyId);
  const target: MarkerTarget = 'role' in receipt
    ? { role: receipt.role }
    : { recordId: receipt.recordId };
  const entry: Entry = { target, name, handle: undefined, settlement: { kind: 'pending' } };
  state.entries.set(replyId, entry);
  return entry;
}

export function clearPendingName(state: ReplyMarkers, replyId: string): void {
  const names = state.pendingNames;
  if (!names) return;
  names.delete(replyId);
  if (names.size === 0) delete state.pendingNames;
}

export function refreshPendingName(
  state: ReplyMarkers, replyIds: Set<string>, update: PendingNameUpdate, opening: Opening,
): void {
  if (replyIds.has(update.id)) return;
  const entry = state.entries.get(update.id);
  if (entry) {
    if (entry.name === update.name) return;
    entry.name = update.name;
    entry.handle?.show(runningView(entry, opening));
    return;
  }
  state.pendingNames ??= new Map();
  state.pendingNames.set(update.id, update.name);
}

export function settle(
  state: ReplyMarkers,
  replyIds: Set<string>,
  reply: Pick<BackgroundReply, 'id' | 'record'> | undefined,
  terminal: Terminal,
  opening: Opening,
): Draw | undefined {
  if (!reply) return undefined;
  replyIds.add(reply.id);
  clearPendingName(state, reply.id);
  const entry = state.entries.get(reply.id);
  if (!entry) return undefined;
  state.entries.delete(reply.id);
  const { record } = reply;
  if (!record) {
    entry.settlement = { kind: 'none' };
    entry.handle?.remove();
    return undefined;
  }
  entry.settlement = { kind: 'link', record };
  entry.handle?.show(linkView(record, opening));
  return drawLink(terminal, record, opening);
}
