import type { Terminal } from '@xterm/xterm';
import { insertMarkdownBlock } from './markdown-block';
import { formatDispatchedCommand, formatEchoedCommand } from './format-dispatched-command';
import { markdownToAnsi } from './markdown-to-ansi';
import { stripTerminalControls } from './strip-terminal-controls';
import type { ReplyPlacement } from './reply-placement';

// A reply beneath its command line, rendered as Markdown where the terminal can lay a block out and
// as styled terminal text where it cannot. The line is left out when the reply continues beneath an
// echo of it that is still the last thing on screen.
export function writeShellReply(
  terminal: Terminal, placement: ReplyPlacement, rawLine: string, rawMarkdown: string, openLink: (href: string) => void,
): void {
  const line = stripTerminalControls(rawLine);
  const markdown = stripTerminalControls(rawMarkdown);
  const head = placement.reply(line) ? line : undefined;
  if (insertMarkdownBlock(terminal, head, markdown, openLink)) return;
  terminal.write(formatDispatchedCommand(head, markdownToAnsi(markdown)));
}

// A command line whose reply comes later, written now unless its reply has already been written.
export function writeShellEcho(terminal: Terminal, placement: ReplyPlacement, rawLine: string): void {
  const line = stripTerminalControls(rawLine);
  if (placement.echo(line)) terminal.write(formatEchoedCommand(line));
}
