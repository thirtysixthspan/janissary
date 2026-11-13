export const FILE_MUTATION_PRIMER = [
  'To write or edit a file in the workspace, end your reply with one line:',
  'file write {"path":"<path>","content":"<text>"}',
  'file edit {"path":"<path>","oldString":"<text>","newString":"<text>"}',
  String.raw`Keep the JSON on that one line; write newlines inside strings as \n. Paths are relative to the workspace root.`,
  'A write creates or overwrites the file and creates missing parent folders; "expectedHash" is optional on write.',
  'An edit replaces exact text that must match once, unless "replaceAll" is true. Files and arguments are limited to 5 MB.',
].join('\n');

export function isFileWriteCommandLine(line: string): boolean {
  return /^file\s+write(\s|$)/i.test(line);
}

export function isFileEditCommandLine(line: string): boolean {
  return /^file\s+edit(\s|$)/i.test(line);
}

export function isFileMutationCommandLine(line: string): boolean {
  return isFileWriteCommandLine(line) || isFileEditCommandLine(line);
}
