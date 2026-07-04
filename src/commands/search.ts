import type { Command } from './types.js';
import { flattenBuffer } from '../tab-formatting.js';
import { compilePattern, findMatches } from '../search-matches.js';

export const SEARCH_USAGE = 'Usage: search transcript <pattern>';

// Server half of transcript search: the web client handles matching/highlighting itself
// (it already holds the flattened transcript), so this command only covers the no-match
// report and non-interactive dispatch (e.g. scripted/`send`-delivered commands).
export const command: Command = {
  name: 'search',
  match: (command_) => /^search\s+transcript\b/i.test(command_),
  run: (command_, tab, managers) => {
    const pattern = command_.replace(/^search\s+transcript\b\s*/i, '').trim();
    const append = (output: string) => managers.tab.append(tab.label, { input: command_, output });
    if (!pattern || !compilePattern(pattern)) { append(SEARCH_USAGE); return; }
    const target = managers.tab.tabs.find((t) => t.label === tab.label);
    const lines = flattenBuffer(target?.log ?? []);
    const matches = findMatches(lines, pattern);
    if (matches.length === 0) { append('No matches found in the transcript.'); return; }
    append(lines[matches.at(-1)!].text);
  },
};
