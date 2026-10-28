import { describe, expect, it } from 'vitest';
import { parseProfileCommand, PROFILE_USAGE } from './command.js';

describe('parseProfileCommand', () => {
  it('parses list', () => {
    expect(parseProfileCommand('profile list')).toEqual({ action: 'list' });
  });

  it('parses launch with a name', () => {
    expect(parseProfileCommand('profile launch writing')).toEqual({ action: 'launch', name: 'writing' });
  });

  it('reports usage for bare launch', () => {
    expect(parseProfileCommand('profile launch')).toEqual({ error: 'Usage: profile launch <name>' });
  });

  it('reports the top-level usage for a malformed command', () => {
    expect(parseProfileCommand('profile')).toEqual({ error: PROFILE_USAGE });
    expect(parseProfileCommand('profile bogus')).toEqual({ error: PROFILE_USAGE });
  });
});
