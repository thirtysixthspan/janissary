import type { BufferLine } from '@shared/protocol';
import { findMatches } from '@shared/search-matches';
import { parseSearchTranscriptCommand } from './search-intercept';

// Returns a pattern to open search mode with, or null when the input should proceed through the
// normal command pipeline — including a `search transcript` pattern with no matches, which falls
// through so the server can report "No matches found in the transcript."
export function resolveSearchInterception(text: string, canSearch: boolean, lines: BufferLine[]): string | null {
  if (!canSearch) return null;
  const pattern = parseSearchTranscriptCommand(text);
  if (!pattern) return null;
  return findMatches(lines, pattern).length > 0 ? pattern : null;
}
