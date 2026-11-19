export const NOTIFY_PRIMER = [
  'You can push a message into the user\'s notifications feed with the notify command.',
  'Write it as one line: notify <message>',
  'The message lands in the feed attributed to this tab, even when the feed is not on screen. To notify the user, end your reply with exactly one notify command on its own final line. When the task is done, reply with the final answer and NO trailing command.',
].join('\n');

export function isNotifyCommandLine(line: string): boolean {
  const text = line.trimStart();
  const end = text.search(/\s/);
  const first = end === -1 ? text : text.slice(0, end);
  return first.toLowerCase() === 'notify';
}
