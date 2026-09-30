import type { SearchIntent } from './shared.js';

// The three query modes, the part of a search the plugin remembers across restarts. The query and
// the narrowing fields are what the user is looking for right now; the modes are how they like to
// look, so only these outlive the process.
export type SearchModes = Pick<SearchIntent, 'regex' | 'matchCase' | 'wholeWord'>;

// Read the modes out of this plugin's saved settings. Each falls back to off on its own, so a file
// edited by hand, or written before a mode existed, still yields the other two as saved.
export function modesFrom(settings: Record<string, unknown>): SearchModes {
  return {
    regex: settings.regex === true,
    matchCase: settings.matchCase === true,
    wholeWord: settings.wholeWord === true,
  };
}

export function sameModes(left: SearchModes, right: SearchModes): boolean {
  return left.regex === right.regex
    && left.matchCase === right.matchCase
    && left.wholeWord === right.wholeWord;
}
