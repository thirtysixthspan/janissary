export function decodeShellCommand(marker: string): string | undefined {
  const separator = marker.indexOf(';');
  if (separator === -1) return undefined;
  try {
    const binary = atob(marker.slice(separator + 1));
    const bytes = Uint8Array.from(binary, (character) => character.codePointAt(0) ?? 0);
    const command = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return command.trim() === '' ? undefined : command;
  } catch {
    return undefined;
  }
}
