import { normalizeWebUrl } from '../openers/web-target.js';

// What a source line names, decided from the string alone so the same answer comes out whether the
// line came from the command bar, a context-menu selection, or a stored record.
export type SourceRef =
  | { kind: 'url'; url: string }
  | { kind: 'file'; path: string };

// The scheme rules are the ones `open <url>` and the page plugin already apply, so a source that
// `open` would refuse to fetch is refused here for the same stated reason rather than by a second
// set of opinions. A bare host is an https URL; anything else with a scheme is refused.
export function parseSource(raw: string): SourceRef | { error: string } {
  const line = raw.trim();
  if (!line) return { error: 'empty source' };
  if (line.startsWith('/') || line.startsWith('~') || line.startsWith('.')) {
    return { kind: 'file', path: line };
  }
  const normalized = normalizeWebUrl(line);
  if ('error' in normalized) return normalized;
  return { kind: 'url', url: normalized.url };
}
