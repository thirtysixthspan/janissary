import { useCallback, useMemo, useRef } from 'react';
import type { IMarker, Terminal } from '@xterm/xterm';
import type { ShellAcpReceipt, ShellConnectionRow } from '@shared/plugins/shell/shared';
import type { TabPluginClientCapabilities } from '../api';
import type { ReplyPlacement } from './reply-placement';
import { addThinkingMarker, type ThinkingMarkerHandle, type ThinkingMarkerView } from './thinking-marker-decoration';
import { writeShellEcho, writeShellReply } from './write-shell-reply';

type Receiver = Parameters<NonNullable<TabPluginClientCapabilities['onBackgroundReply']>>[0];

export type ShellReplyOutcome = Pick<Parameters<Receiver>[0], 'id' | 'record'>;

type ReplyRecord = NonNullable<ShellReplyOutcome['record']>;

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

export type ReplyMarkers = { entries: Map<string, Entry>; written: Set<string> };

export function createReplyMarkers(): ReplyMarkers {
  return { entries: new Map(), written: new Set() };
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

function begin(state: ReplyMarkers, receipt: ShellAcpReceipt): Entry | undefined {
  const { replyId } = receipt;
  if (state.entries.has(replyId) || state.written.has(replyId)) return undefined;
  const entry: Entry = { role: receipt.role, name: receipt.name, handle: undefined, settlement: { kind: 'pending' } };
  state.entries.set(replyId, entry);
  return entry;
}

function settle(state: ReplyMarkers, reply: ShellReplyOutcome | undefined, terminal: Terminal, opening: Opening): Draw | undefined {
  if (!reply) return undefined;
  state.written.add(reply.id);
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
  openLink?: (href: string) => void;
  openConnection?: (row: ShellConnectionRow) => void;
  label?: string;
};

export function useShellReplyWriters({ terminalRef, placementRef, markersRef, openLink, openConnection, label }: Inputs) {
  const openLinkRef = useRef(openLink);
  openLinkRef.current = openLink;
  const openConnectionRef = useRef(openConnection);
  openConnectionRef.current = openConnection;
  const labelRef = useRef(label);
  labelRef.current = label;
  const opening = useMemo<Opening>(() => ({ openConnection: openConnectionRef, label: labelRef }), []);
  const displayReply = useCallback((rawLine: string, rawMarkdown: string, reply?: ShellReplyOutcome) => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    const onHeadMarker = settle(markersRef.current, reply, terminal, opening);
    writeShellReply(terminal, placementRef.current, rawLine, rawMarkdown, (href) => { openLinkRef.current?.(href); }, onHeadMarker);
  }, [terminalRef, placementRef, markersRef, opening]);
  const echoCommand = useCallback((rawLine: string, receipt?: ShellAcpReceipt) => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    const state = markersRef.current;
    const entry = receipt ? begin(state, receipt) : undefined;
    const onMarker = entry ? drawEcho(terminal, entry, opening) : undefined;
    const wrote = writeShellEcho(terminal, placementRef.current, rawLine, onMarker);
    if (!wrote && receipt && entry) state.entries.delete(receipt.replyId);
  }, [terminalRef, placementRef, markersRef, opening]);
  return { displayReply, echoCommand };
}
