import { describe, it, expect } from 'vitest';
import { commitFailureText, commitSuccessText, NOTHING_TO_COMMIT_TEXT } from './commit-report.js';

describe('commitSuccessText', () => {
  it('carries git\'s own outcome summary', () => {
    expect(commitSuccessText('1 file changed, 2 insertions(+)'))
      .toBe('Committed to origin: 1 file changed, 2 insertions(+)');
  });

  it('states the commit ran when git printed no summary', () => {
    expect(commitSuccessText('')).toBe('Committed to origin');
  });
});

describe('commitFailureText', () => {
  it('carries an Error\'s message', () => {
    expect(commitFailureText(new Error('no upstream branch'))).toBe('Could not commit: no upstream branch');
  });

  it('stringifies a non-Error throw', () => {
    expect(commitFailureText('killed')).toBe('Could not commit: killed');
  });
});

describe('NOTHING_TO_COMMIT_TEXT', () => {
  it('borrows neither of the other two outcomes\' stems', () => {
    expect(NOTHING_TO_COMMIT_TEXT).toBe('Nothing to commit');
  });
});
