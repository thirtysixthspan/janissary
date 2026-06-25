import { describe, it, expect } from 'vitest';
import { bashRecognizer } from './bash.js';

const noDatabase = { openDbs: [] as string[] };

describe('bashRecognizer', () => {
  it('matches a leading common command with high reliability', () => {
    const r = bashRecognizer.recognize('ls -la', noDatabase);
    expect(r.match).toBe(true);
    expect(r.reliability).toBeGreaterThanOrEqual(0.9);
  });

  it('matches on shell operators even without a known command', () => {
    expect(bashRecognizer.recognize('foo | bar > out.txt', noDatabase).match).toBe(true);
  });

  it('matches an explicit executable path', () => {
    expect(bashRecognizer.recognize('./build.sh', noDatabase).match).toBe(true);
  });

  it('does not match plain prose', () => {
    expect(bashRecognizer.recognize('what time is it', noDatabase).match).toBe(false);
  });

  it('keeps a real command invocation when args look shell-like', () => {
    // "which" used as the shell command with a program argument, not as a question word.
    expect(bashRecognizer.recognize('which node', noDatabase).match).toBe(true);
    expect(bashRecognizer.recognize('find . -name x', noDatabase).match).toBe(true);
    expect(bashRecognizer.recognize('set -e', noDatabase).match).toBe(true);
  });

  it('discounts an ambiguous command word leading a prose sentence', () => {
    // "which"/"find" double as English words; a grammatical sentence is not a shell command.
    expect(bashRecognizer.recognize('which file is the longest', noDatabase).match).toBe(false);
    expect(bashRecognizer.recognize('find the largest file', noDatabase).match).toBe(false);
  });
});
