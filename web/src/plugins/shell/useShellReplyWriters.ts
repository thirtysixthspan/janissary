import { useCallback, useMemo, useRef } from 'react';
import type { Terminal } from '@xterm/xterm';
import type { TabPluginClientCapabilities } from '../api';
import type { ShellAcpReceipt, ShellConnectionRow } from '@shared/plugins/shell/shared';
import type { ReplyPlacement } from './reply-placement';
import {
  begin, clearPendingName, drawEcho, refreshPendingName, settle,
  type Opening, type PendingNameUpdate, type ReplyMarkers,
} from './reply-markers';
import { writeShellEcho, writeShellReply } from './write-shell-reply';

type BackgroundReceiver = Parameters<NonNullable<TabPluginClientCapabilities['onBackgroundReply']>>[0];
type BackgroundReply = Parameters<BackgroundReceiver>[0];

export type ShellReplyOutcome = Pick<BackgroundReply, 'id' | 'record'> | PendingNameUpdate;

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
  const echoCommand = useCallback((rawLine: string, receipt?: ShellAcpReceipt) => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    const state = markersRef.current;
    const entry = receipt ? begin(state, replyIds, receipt) : undefined;
    const onMarker = entry ? drawEcho(terminal, entry, opening) : undefined;
    const wrote = writeShellEcho(terminal, placementRef.current, rawLine, onMarker);
    if (!wrote && receipt && entry) state.entries.delete(receipt.replyId);
  }, [terminalRef, placementRef, markersRef, opening, replyIds]);
  const displayReply = useCallback((rawLine: string, rawMarkdown: string, reply?: ShellReplyOutcome) => {
    if (reply && 'pending' in reply) {
      refreshPendingName(markersRef.current, replyIds, reply, opening);
      if (reply.role !== undefined && reply.echo !== undefined
        && !markersRef.current.entries.has(reply.id) && !replyIds.has(reply.id)) {
        echoCommand(reply.echo, {
          replyId: reply.id, role: reply.role, name: reply.name, echo: reply.echo,
        });
      }
      return;
    }
    if (reply) clearPendingName(markersRef.current, reply.id);
    const terminal = terminalRef.current;
    if (!terminal) return;
    const onHeadMarker = settle(markersRef.current, replyIds, reply, terminal, opening);
    writeShellReply(terminal, placementRef.current, rawLine, rawMarkdown, (href) => { openLinkRef.current?.(href); }, onHeadMarker);
  }, [terminalRef, placementRef, markersRef, opening, replyIds, echoCommand]);
  return { displayReply, echoCommand };
}
