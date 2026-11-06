import { useCallback } from 'react';
import type { Terminal } from '@xterm/xterm';
import { shellSelectionText, type ReplySelection } from './reply-selection';
import { readTranscriptLines, revealTranscriptRow, type TranscriptLines } from './transcript-lines';

// The parts of the shell terminal's handle that read or move what is on screen without writing to it:
// focus, the selection, scrolling, and the transcript the find overlay searches. Each reads the
// emulator through its ref, so every callback keeps one identity for the life of the tab.
export function useShellTerminalView(
  terminalRef: React.RefObject<Terminal | null>,
  replyRef: React.RefObject<ReplySelection | null>,
) {
  const focus = useCallback(() => { terminalRef.current?.focus(); }, [terminalRef]);
  const selection = useCallback(() => shellSelectionText(replyRef.current, terminalRef.current), [replyRef, terminalRef]);
  const clearSelection = useCallback(() => {
    replyRef.current?.clear();
    terminalRef.current?.clearSelection();
  }, [replyRef, terminalRef]);
  const scrollLines = useCallback((amount: number) => { terminalRef.current?.scrollLines(amount); }, [terminalRef]);
  const scrollToBottom = useCallback(() => { terminalRef.current?.scrollToBottom(); }, [terminalRef]);
  const rows = useCallback(() => terminalRef.current?.rows ?? 0, [terminalRef]);
  const transcript = useCallback((): TranscriptLines => {
    const terminal = terminalRef.current;
    return terminal ? readTranscriptLines(terminal.buffer.active) : { lines: [], rows: [] };
  }, [terminalRef]);
  const revealRow = useCallback((row: number) => {
    const terminal = terminalRef.current;
    if (terminal) revealTranscriptRow(terminal, row);
  }, [terminalRef]);
  return { focus, selection, clearSelection, scrollLines, scrollToBottom, rows, transcript, revealRow };
}
