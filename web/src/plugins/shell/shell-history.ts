export function appendShellHistory(previous: string[], line: string): string[] {
  const entry = line.trim();
  return entry === '' ? previous : [...previous, entry];
}
