// Writing to the system clipboard, shared by the default context menu's Copy and the file
// navigator's own copy. Feature-detected: a browser may withhold the async clipboard, and jsdom
// implements none of it.

async function writeClipboardText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // No clipboard to write to — a browser may withhold it, and a denied write is not an error
    // the caller can do anything about.
  }
}

export function copyText(text: string): void {
  if (!text) return;
  void writeClipboardText(text);
}
