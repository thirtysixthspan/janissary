export const SNAPSHOT_USAGE = 'Usage: video snapshot <video path> at <time> <destination path>';

export type SnapshotRequest = {
  video: string;
  time: string;
  seconds: number;
  destination: string;
};

const WHOLE = /^\d+$/u;
export function isSnapshotArgument(argument: string): boolean {
  return argument.trim().split(/\s+/u, 1)[0]?.toLowerCase() === 'snapshot';
}

function isDecimal(text: string): boolean {
  const parts = text.split('.');
  return parts.length <= 2 && parts.every((part) => WHOLE.test(part));
}

export function parseTimestamp(text: string): number | undefined {
  const fields = text.split(':');
  if (fields.length > 3) return undefined;
  const seconds = fields.at(-1) ?? '';
  const leading = fields.slice(0, -1);
  if (!isDecimal(seconds) || leading.some((field) => !WHOLE.test(field))) return undefined;
  const values = [...leading.map(Number), Number(seconds)];
  if (values.slice(1).some((value) => value >= 60)) return undefined;
  return values.reduce((total, value) => total * 60 + value, 0);
}

export function parseSnapshotArgument(argument: string): SnapshotRequest | { error: string } {
  const words = argument.trim().split(/\s+/u).slice(1);
  for (let index = 1; index < words.length - 2; index += 1) {
    if (words[index].toLowerCase() !== 'at') continue;
    const time = words[index + 1];
    const seconds = parseTimestamp(time);
    if (seconds === undefined) continue;
    return {
      video: words.slice(0, index).join(' '),
      time,
      seconds,
      destination: words.slice(index + 2).join(' '),
    };
  }
  return { error: SNAPSHOT_USAGE };
}
