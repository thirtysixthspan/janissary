export function isWebCommandLine(line: string): boolean {
  return /^web(\s|$)/i.test(line);
}
