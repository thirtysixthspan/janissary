import { describe, it, expect } from 'vitest';
import { acpRecognizer } from './acp.js';

const noDb = { openDbs: [] as string[] };

describe('acpRecognizer', () => {
  it('matches a question', () => {
    expect(acpRecognizer.recognize('how do I list files?', noDb).reliability).toBeGreaterThanOrEqual(0.8);
  });

  it('matches an instruction opener', () => {
    expect(acpRecognizer.recognize('explain this codebase', noDb).match).toBe(true);
  });

  it('does not match a piped shell command', () => {
    expect(acpRecognizer.recognize('cat x | grep y', noDb).match).toBe(false);
  });
});
