import { TAB_SUBCOMMANDS } from './parse-tab.js';

export const TAB_PRIMER = [
  'You can arrange the application\'s tabs with the tab command.',
  'Write it as one line: tab <subcommand> <tab> [argument]',
  `The subcommands are ${TAB_SUBCOMMANDS.join(', ')}. Quote a tab name that contains spaces.`,
  'The result arrives as your next message. When the task is done, reply with the final answer and NO trailing command.',
].join('\n');

export function isTabCommandLine(line: string): boolean {
  const text = line.trimStart();
  const end = text.search(/\s/);
  const first = end === -1 ? text : text.slice(0, end);
  return first.toLowerCase() === 'tab';
}
