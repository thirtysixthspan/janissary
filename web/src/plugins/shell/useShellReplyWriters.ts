import { useCallback, useMemo, useRef } from 'react';
import type { IMarker, Terminal } from '@xterm/xterm';
import type { ShellAcpReceipt, ShellConnectionRow } from '@shared/plugins/shell/shared';
import type { TabPluginClientCapabilities } from '../api';
import type { ReplyPlacement } from './reply-placement';
import { addThinkingMarker, type ThinkingMarkerHandle, type ThinkingMarkerView } from './thinking-marker-decoration';
import { writeShellEcho, writeShellReply } from './write-shell-reply';

type Receiver = Parameters<NonNullable<TabPluginClientCapabilities['onBackgroundReply']>>[0];
type BackgroundReply = Parameters<Receiver>[0];
type PendingNameUpdate = { id: string; pending: true; name: string };

export type ShellReplyOutcome = Pick<BackgroundReply, 'id' | 'record'> | PendingNameUpdate;

type ReplyRecord = NonNullable<BackgroundReply['record']>;

type Settlement =
  | { kind: 'pending' }
  | { kind: 'link'; record: ReplyRecord }
  | { kind: 'none' };

type Entry = {
  role: ShellAcpReceipt['role'];
  name: string;
  handle: ThinkingMarkerHandle | undefined;
  settlement: Settlement;
};

export type ReplyMarkers = { entries: Map<string, Entry>; pendingNames?: Map<string, string> };

export function createReplyMarkers(): ReplyMarkers {
  return { entries: new Map() };
}

type Opening = {
  openConnection: React.RefObject<((row: ShellConnectionRow) => void) | undefined>;
  label: React.RefObject<string | undefined>;
};

type Draw = (marker: IMarker) => void;

function runningView(entry: Entry, opening: Opening): ThinkingMarkerView {
  return {
    kind: 'running',
    name: entry.name,
    onOpen: () => {
      const open = opening.openConnection.current;
      const label = opening.label.current;
      if (!open || !label) return;
      open({ text: entry.name, kind: 'acp', acpRef: { scope: 'tab', label, role: entry.role } });
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

function drawEcho(terminal: Terminal, entry: Entry, opening: Opening): Draw {
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

function begin(state: ReplyMarkers, replyIds: Set<string>, receipt: ShellAcpReceipt): Entry | undefined {
  const { replyId } = receipt;
  if (state.entries.has(replyId) || replyIds.has(replyId)) return undefined;
  const name = state.pendingNames?.get(replyId) ?? receipt.name;
  clearPendingName(state, replyId);
  const entry: Entry = { role: receipt.role, name, handle: undefined, settlement: { kind: 'pending' } };
  state.entries.set(replyId, entry);
  return entry;
}

function clearPendingName(state: ReplyMarkers, replyId: string): void {
  const names = state.pendingNames;
  if (!names) return;
  names.delete(replyId);
  if (names.size === 0) delete state.pendingNames;
}

function refreshPendingName(
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

function settle(
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

type Inputs = {
  terminalRef: React.RefObject<Terminal | null>;
  placementRef: React.RefObject<ReplyPlacement>;
  markersRef: React.RefObject<ReplyMarkers>;
  replyIds: Set<string>;
  openLink?: (href: string) => void;
  openConnection?: (row: ShellConnectionRow) => void;
  label?: string;
};

export function useShellReplyWriters({ terminalRef, placementRef, markersRef, replyIds, openLink, openConnection, label }: Inputs) {
  const openLinkRef = useRef(openLink);
  openLinkRef.current = openLink;
  const openConnectionRef = useRef(openConnection);
  openConnectionRef.current = openConnection;
  const labelRef = useRef(label);
  labelRef.current = label;
  const opening = useMemo<Opening>(() => ({ openConnection: openConnectionRef, label: labelRef }), []);
  const displayReply = useCallback((rawLine: string, rawMarkdown: string, reply?: ShellReplyOutcome) => {
    if (reply && 'pending' in reply) {
      refreshPendingName(markersRef.current, replyIds, reply, opening);
      return;
    }
    if (reply) clearPendingName(markersRef.current, reply.id);
    const terminal = terminalRef.current;
    if (!terminal) return;
    const onHeadMarker = settle(markersRef.current, replyIds, reply, terminal, opening);
    writeShellReply(terminal, placementRef.current, rawLine, rawMarkdown, (href) => { openLinkRef.current?.(href); }, onHeadMarker);
  }, [terminalRef, placementRef, markersRef, opening, replyIds]);
  const echoCommand = useCallback((rawLine: string, receipt?: ShellAcpReceipt) => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    const state = markersRef.current;
    const entry = receipt ? begin(state, replyIds, receipt) : undefined;
    const onMarker = entry ? drawEcho(terminal, entry, opening) : undefined;
    const wrote = writeShellEcho(terminal, placementRef.current, rawLine, onMarker);
    if (!wrote && receipt && entry) state.entries.delete(receipt.replyId);
  }, [terminalRef, placementRef, markersRef, opening, replyIds]);
  return { displayReply, echoCommand };
}
