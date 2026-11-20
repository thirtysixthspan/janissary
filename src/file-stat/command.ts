export type FileStatArgs = { path: string };

export const FILE_STAT_USAGE = 'Usage: file stat <path>';

export function parseFileStat(input: string): FileStatArgs | { error: string } {
  const [command, subcommand, ...rest] = input.trim().split(/\s+/);
  if (command.toLowerCase() !== 'file' || subcommand?.toLowerCase() !== 'stat') return { error: FILE_STAT_USAGE };
  if (rest.length !== 1) return { error: FILE_STAT_USAGE };
  return { path: rest[0] };
}

export function isFileStatCommandLine(line: string): boolean {
  return /^file\s+stat(\s|$)/i.test(line);
}
