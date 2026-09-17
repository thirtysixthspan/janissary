import { describe, it, expect } from 'vitest';
import { commitBranchTooltipSuffix } from './commit-branch-tooltip';

describe('commitBranchTooltipSuffix', () => {
  it('is empty when no branch is given', () => {
    expect(commitBranchTooltipSuffix(undefined)).toBe('');
  });

  it('names the branch when given one', () => {
    expect(commitBranchTooltipSuffix('main')).toBe(' (branch main)');
  });
});
