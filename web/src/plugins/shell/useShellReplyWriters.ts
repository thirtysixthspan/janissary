import { useCallback } from 'react';
import type { Terminal } from '@xterm/xterm';
import type { ReplyPlacement } from './reply-placement';
import { writeShellEcho, writeShellReply } from './write-shell-reply';

export function useShellReplyWriters(
  terminalRef: React.RefObject<Terminal | null>,
  placementRef: React.RefObject<ReplyPlacement>,
  openLinkRef: React.RefObject<((href: string) => void) | undefined>,
) {
  const displayReply = useCallback((rawLine: string, rawMarkdown: string) => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    writeShellReply(terminal, placementRef.current, rawLine, rawMarkdown, (href) => { openLinkRef.current?.(href); });
  }, [terminalRef, placementRef, openLinkRef]);
  const echoCommand = useCallback((rawLine: string) => {
    const terminal = terminalRef.current;
    if (terminal) writeShellEcho(terminal, placementRef.current, rawLine);
  }, [terminalRef, placementRef]);
  return { displayReply, echoCommand };
}
