import type { IMarker, Terminal } from '@xterm/xterm';
import { insertMarkdownBlock } from './markdown-block';
import { formatDispatchedCommand, formatEchoedCommand } from './format-dispatched-command';
import { markdownToAnsi } from './markdown-to-ansi';
import { commandHead } from './shell-prompt';
import { stripTerminalControls } from './strip-terminal-controls';
import type { ReplyPlacement } from './reply-placement';

// Hands `onMarker` a marker on the first row of the command line just written. It runs inside the
// write's completion callback, when the data has been parsed and the cursor is on the row below the
// line, because at the moment of the call the write is still queued behind earlier output and the
// cursor is not yet where the line will land. The first row and not the last, which xterm reflows
// differently: narrowing the terminal inserts continuation rows after a line and moves no marker,
// while widening deletes every row of a wrapped line but its first, and xterm disposes a marker on a
// deleted row. Nothing is registered while a full-screen program holds the alternate buffer, whose
// markers xterm discards when the program leaves it.
function markFirstRow(terminal: Terminal, onMarker: (marker: IMarker) => void): void {
  const buffer = terminal.buffer.active;
  if (buffer.type !== 'normal') return;
  const cursor = buffer.baseY + buffer.cursorY;
  let first = cursor - 1;
  while (first > 0 && buffer.getLine(first)?.isWrapped) first -= 1;
  onMarker(terminal.registerMarker(first - cursor));
}

// A reply beneath its command line, rendered as Markdown where the terminal can lay a block out and
// as styled terminal text where it cannot. The line is left out when the reply continues beneath an
// echo of it that is still the last thing on screen. Returns whether the reply wrote its own line.
//
// With `onHeadMarker`, a reply that writes its own line writes that line as a chunk of its own and
// the handler gets a marker on its first row once the chunk has been parsed; the body follows as it
// does beneath an echo. The head cannot be located after the fact, because the rows a body occupies
// are not known until it is parsed. The handler runs inside xterm's write callback, so it must not
// throw, and it may run before this function returns.
export function writeShellReply(
  terminal: Terminal, placement: ReplyPlacement, rawLine: string, rawMarkdown: string, openLink: (href: string) => void,
  onHeadMarker?: (marker: IMarker) => void,
): boolean {
  const line = stripTerminalControls(rawLine);
  const markdown = stripTerminalControls(rawMarkdown);
  const ownLine = placement.reply(line);
  if (ownLine && onHeadMarker) terminal.write(commandHead(line), () => { markFirstRow(terminal, onHeadMarker); });
  const head = ownLine && !onHeadMarker ? line : undefined;
  if (!insertMarkdownBlock(terminal, head, markdown, openLink)) {
    terminal.write(formatDispatchedCommand(head, markdownToAnsi(markdown)));
  }
  return ownLine;
}

// A command line whose reply comes later, written now unless its reply has already been written.
// Returns whether the echo was written. With `onMarker`, the handler gets a marker on the echo's
// first row once the echo has been parsed; it runs inside xterm's write callback, so it must not
// throw, and it may run before this function returns. It is never called for a skipped echo.
export function writeShellEcho(
  terminal: Terminal, placement: ReplyPlacement, rawLine: string, onMarker?: (marker: IMarker) => void,
): boolean {
  const line = stripTerminalControls(rawLine);
  if (!placement.echo(line)) return false;
  const echo = formatEchoedCommand(line);
  if (onMarker) terminal.write(echo, () => { markFirstRow(terminal, onMarker); });
  else terminal.write(echo);
  return true;
}
