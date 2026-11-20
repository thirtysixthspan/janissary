export type FileExistsArgs = { path: string };

export const FILE_EXISTS_USAGE = 'Usage: file exists <path>';

export function parseFileExists(input: string): FileExistsArgs | { error: string } {
  const [command, subcommand, ...rest] = input.trim().split(/\s+/);
  if (command.toLowerCase() !== 'file' || subcommand?.toLowerCase() !== 'exists') return { error: FILE_EXISTS_USAGE };
  if (rest.length !== 1) return { error: FILE_EXISTS_USAGE };
  return { path: rest[0] };
}

export function isFileExistsCommandLine(line: string): boolean {
  return /^file\s+exists(\s|$)/i.test(line);
}
