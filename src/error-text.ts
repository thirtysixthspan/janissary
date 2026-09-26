export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// The one line of an error a report shows, rather than the whole message: the first line, with the
// sentence punctuation a thrown library message usually ends in removed, and a stand-in when the
// value carries no text at all. Both plugin hosts disable a plugin on this sentence, so the two
// sides derive it the same way rather than each trimming it their own fashion.
export function errorFirstLine(error: unknown): string {
  const message = errorText(error);
  const firstLine = message.split(/\r?\n/, 1)[0].trim().replace(/[.!?;:]+$/u, '').trim();
  return firstLine || 'Unknown failure';
}
