import { describe, it, expect } from 'vitest';
import { pullFailureText, pullSuccessText } from './pull-report.js';

describe('pullSuccessText', () => {
  it('carries git\'s own outcome summary', () => {
    expect(pullSuccessText('Already up to date.')).toBe('Pulled from origin: Already up to date.');
  });

  it('states the pull ran when git printed no summary', () => {
    expect(pullSuccessText('')).toBe('Pulled from origin');
  });
});

describe('pullFailureText', () => {
  it('carries an Error\'s message', () => {
    expect(pullFailureText(new Error('no upstream branch'))).toBe('Could not pull: no upstream branch');
  });

  it('stringifies a non-Error throw', () => {
    expect(pullFailureText('killed')).toBe('Could not pull: killed');
  });
});
