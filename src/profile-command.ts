import type { ProfileParsed } from './types.js';

// The `profile` command's parsing, split out of profiles.ts: a distinct concern from the
// file-loading helpers that remain there.

export const PROFILE_USAGE = 'Usage: profile launch <name> | profile list | profile save <name> | profile validate [<name>]';

export function parseProfileCommand(command: string): ProfileParsed {
  const rest = command.replace(/^profile\b\s*/i, '').trim();
  if (!rest) return { error: PROFILE_USAGE };
  const tokens = rest.split(/\s+/);
  const head = tokens[0].toLowerCase();
  if (head === 'list') return { action: 'list' };
  if (head === 'launch') {
    if (!tokens[1]) return { error: 'Usage: profile launch <name>' };
    return { action: 'launch', name: tokens[1] };
  }
  if (head === 'save') {
    if (!tokens[1]) return { error: 'Usage: profile save <name>' };
    return { action: 'save', name: tokens[1] };
  }
  if (head === 'validate') return { action: 'validate', name: tokens[1] };
  return { error: PROFILE_USAGE };
}
