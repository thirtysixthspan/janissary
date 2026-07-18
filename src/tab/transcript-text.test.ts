import { describe, expect, it } from 'vitest';
import { transcriptText } from './transcript-text.js';

describe('transcriptText', () => {
  it('joins input and output per entry, blank-line separated', () => {
    const log = [{ input: 'npm test', output: '1 failing' }, { input: '', output: 'idle' }];
    expect(transcriptText(log)).toBe('> npm test\n1 failing\n\nidle');
  });

  it('returns an empty string for an empty log', () => {
    expect(transcriptText([])).toBe('');
  });
});
