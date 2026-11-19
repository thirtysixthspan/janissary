export type FileListArgs = { path: string };

export const FILE_LIST_USAGE = 'Usage: file list <path>';

export function parseFileList(input: string): FileListArgs | { error: string } {
  const [command, subcommand, ...rest] = input.trim().split(/\s+/);
  if (command.toLowerCase() !== 'file') return { error: FILE_LIST_USAGE };
  const operation = subcommand?.toLowerCase();
  if (operation !== 'list' && operation !== 'ls') return { error: FILE_LIST_USAGE };
  if (rest.length !== 1) return { error: FILE_LIST_USAGE };
  return { path: rest[0] };
}

export function isFileListCommandLine(line: string): boolean {
  return /^file\s+(?:list|ls)(\s|$)/i.test(line);
}
