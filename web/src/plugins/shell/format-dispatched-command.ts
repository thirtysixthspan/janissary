import { SHELL_PROMPT, shellCommandLine } from './shell-prompt';

export function formatDispatchedCommand(line: string, output: string): string {
  const terminalOutput = output.replaceAll(/\r?\n/gu, '\r\n').replace(/\r\n$/u, '');
  return `\r\u{1B}[2K${shellCommandLine(line)}\r\n${terminalOutput}\r\n${SHELL_PROMPT}`;
}
