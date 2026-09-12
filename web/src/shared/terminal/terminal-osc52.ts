// OSC 52 is how a program running in a terminal reaches the clipboard of the human watching it:
// `ESC ] 52 ; <selection> ; <base64> BEL`. It is the route a harness takes when it cannot reach that
// clipboard itself — running on the far side of an ssh connection, the only clipboard it can touch
// belongs to the wrong machine. xterm.js implements no handler for it, deliberately: writing the
// clipboard is the embedder's decision, so the decoding lives here and `useXterm` registers it.

// Decode a base64 payload as UTF-8. `atob` yields one character per byte, so the bytes are lifted
// back out before decoding — otherwise anything above ASCII arrives mangled.
function decodeBase64Utf8(payload: string): string {
  const binary = atob(payload);
  const bytes = Uint8Array.from(binary, (character) => character.codePointAt(0) ?? 0);
  return new TextDecoder().decode(bytes);
}

/**
 * The text an OSC 52 sequence asks to be put on the clipboard, or `null` when there is nothing to
 * copy: the `?` read form (answered with nothing rather than handing the program whatever the user
 * last copied), an empty payload, data carrying no selection separator, and base64 that will not
 * decode. `data` is what xterm hands an OSC handler — everything after `52;`, so `c;<base64>`.
 */
export function osc52ClipboardText(data: string): string | null {
  const separator = data.indexOf(';');
  if (separator === -1) return null;
  const payload = data.slice(separator + 1);
  if (payload === '' || payload === '?') return null;
  try {
    return decodeBase64Utf8(payload);
  } catch {
    return null;
  }
}
