// Writing to the system clipboard, shared by the default context menu's Copy, the file navigator's
// own copy, and every other clipboard writer in the application — which makes this the one place a
// copy is observed. Feature-detected: a browser may withhold the async clipboard, and jsdom
// implements none of it.

import { captureCopiedText } from './clipboard-captures';

async function writeClipboardText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // No clipboard to write to — a browser may withhold it, and a denied write is not an error
    // the caller can do anything about, unless the caller has something to say about it.
    return false;
  }
}

// `onFailure` exists for the one copy in the application with something useful to say when the
// clipboard refuses — the SQL grid offers to show the text instead. Everywhere else a denied write is
// silent, because nothing can be done about it and a warning on every copy would be noise.
//
// The capture happens whatever the write does: a browser withholding the clipboard is a reason the
// text did not reach the operating system, not a reason the user did not copy it.
export function copyText(text: string, onFailure?: (text: string) => void): void {
  if (!text) return;
  void writeClipboardText(text).then((written) => { if (!written) onFailure?.(text); });
  captureCopiedText(text);
}
