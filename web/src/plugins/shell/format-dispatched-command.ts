import { SHELL_PROMPT, commandHead } from './shell-prompt';

export function formatDispatchedCommand(line: string | undefined, output: string): string {
  const terminalOutput = output.replaceAll(/\r?\n/gu, '\r\n').replace(/\r\n$/u, '');
  return `${commandHead(line)}${terminalOutput}\r\n${SHELL_PROMPT}`;
}

// A command whose reply arrives later: its line now, with a fresh prompt beneath it.
export function formatEchoedCommand(line: string): string {
  return `${commandHead(line)}${SHELL_PROMPT}`;
}
