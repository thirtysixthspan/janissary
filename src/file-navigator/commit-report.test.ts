import { describe, it, expect } from 'vitest';
import {
  commitFailureLeavesStagedText, commitFailureText, commitSuccessText, NOTHING_TO_COMMIT_TEXT,
} from './commit-report.js';

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

  it('carries only the first line of a multi-line git error', () => {
    const error = new Error('Command failed: git push origin HEAD\nerror: failed to push some refs\n1:35PM INF no leaks found\n');
    expect(commitFailureText(error)).toBe('Could not commit: Command failed: git push origin HEAD');
  });
});

describe('commitFailureLeavesStagedText', () => {
  it('carries an Error\'s message and says the staging was left in place', () => {
    expect(commitFailureLeavesStagedText(new Error('pre-commit hook refused')))
      .toBe('Could not commit: pre-commit hook refused — what was staged is still in your index');
  });

  it('carries only the first line of a multi-line git error', () => {
    expect(commitFailureLeavesStagedText(new Error('Command failed: git commit -m x\nhook output')))
      .toBe('Could not commit: Command failed: git commit -m x — what was staged is still in your index');
  });
});

describe('NOTHING_TO_COMMIT_TEXT', () => {
  it('borrows neither of the other two outcomes\' stems', () => {
    expect(NOTHING_TO_COMMIT_TEXT).toBe('Nothing to commit');
  });
});
