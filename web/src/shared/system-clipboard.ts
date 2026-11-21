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
    // the caller can do anything about here; the caller that has something to say uses tryCopyText.
    return false;
  }
}

// Both forms capture the copy whatever the write does: a browser withholding the clipboard is a reason
// the text did not reach the operating system, not a reason the user did not copy it.

// The plain contract: write the text and get on with it. A denied write stays silent, because nothing
// can be done about it here and a warning on every copy would be noise.
export function copyText(text: string): void {
  if (!text) return;
  void writeClipboardText(text);
  captureCopiedText(text);
}

// The same write for the one caller with something to say when the clipboard refuses. It reports the
// outcome instead of taking a feature-specific callback, so the shared contract carries no knowledge
// of any caller's error UI.
export async function tryCopyText(text: string): Promise<boolean> {
  if (!text) return false;
  const written = await writeClipboardText(text);
  captureCopiedText(text);
  return written;
}
