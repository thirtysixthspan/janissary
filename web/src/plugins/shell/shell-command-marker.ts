export type ShellMarker =
  | { kind: 'C'; command: string | undefined }
  | { kind: 'D' }
  | { kind: 'E' };

// A marker counts only when its second field is this attachment's nonce: anything else was printed by a
// program rather than by the shell tab's own hooks (see `shell-status-hooks.ts`).
export function readShellMarker(data: string, nonce: string): ShellMarker | undefined {
  const [kind, signature, ...payload] = data.split(';');
  if (signature !== nonce) return undefined;
  if (kind === 'C') return { kind, command: decodeShellCommand(payload.join(';')) };
  if (kind === 'D' || kind === 'E') return { kind };
  return undefined;
}

export function readShellCwd(data: string, nonce: string): string | undefined {
  const separator = data.indexOf(';');
  if (separator === -1 || data.slice(0, separator) !== nonce) return undefined;
  try {
    const url = new URL(data.slice(separator + 1));
    return url.protocol === 'file:' ? decodeURIComponent(url.pathname) : undefined;
  } catch {
    return undefined;
  }
}

function decodeShellCommand(encoded: string): string | undefined {
  try {
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (character) => character.codePointAt(0) ?? 0);
    const command = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return command.trim() === '' ? undefined : command;
  } catch {
    return undefined;
  }
}
