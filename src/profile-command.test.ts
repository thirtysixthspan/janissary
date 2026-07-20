import { describe, expect, it } from 'vitest';
import { parseProfileCommand, PROFILE_USAGE } from './profile-command.js';

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

  it('parses save with a name', () => {
    expect(parseProfileCommand('profile save writing')).toEqual({ action: 'save', name: 'writing' });
  });

  it('reports usage for bare save', () => {
    expect(parseProfileCommand('profile save')).toEqual({ error: 'Usage: profile save <name>' });
  });

  it('reports the top-level usage for a malformed command', () => {
    expect(parseProfileCommand('profile')).toEqual({ error: PROFILE_USAGE });
    expect(parseProfileCommand('profile bogus')).toEqual({ error: PROFILE_USAGE });
  });
});
