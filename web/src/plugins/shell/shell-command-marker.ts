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

// The hooks send `$PWD` as base64 rather than in a `file://` URL, so no character in a directory name
// has a meaning of its own and the path arrives exactly as zsh holds it.
export function readShellCwd(data: string, nonce: string): string | undefined {
  const separator = data.indexOf(';');
  if (separator === -1 || data.slice(0, separator) !== nonce) return undefined;
  const cwd = decodeBase64Text(data.slice(separator + 1));
  return cwd === '' ? undefined : cwd;
}

function decodeShellCommand(encoded: string): string | undefined {
  const command = decodeBase64Text(encoded);
  return command === undefined || command.trim() === '' ? undefined : command;
}

function decodeBase64Text(encoded: string): string | undefined {
  try {
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (character) => character.codePointAt(0) ?? 0);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}
