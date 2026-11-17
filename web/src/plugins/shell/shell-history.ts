export function appendShellHistory(previous: string[], line: string): string[] {
  const entry = line.trim();
  if (entry === '' || entry === previous.at(-1)) return previous;
  return [...previous, entry];
}
