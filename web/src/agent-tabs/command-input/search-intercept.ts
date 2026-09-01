// Recognize `search transcript <pattern>` so App.tsx can intercept it client-side (like `hist`)
// before it reaches the server. Returns the pattern (possibly empty), or null when the input
// isn't a `search transcript` command at all.
export function parseSearchTranscriptCommand(text: string): string | null {
  const match = /^search\s+transcript\b\s*(.*)$/i.exec(text.trim());
  return match ? match[1].trim() : null;
}
