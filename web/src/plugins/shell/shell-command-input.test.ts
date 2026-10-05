import { describe, expect, it } from 'vitest';
import { shellCommandInput } from './shell-command-input';

describe('shellCommandInput', () => {
  it('keeps single-line input unchanged', () => {
    expect(shellCommandInput('git status')).toBe('git status\n');
  });

  it('brackets a multi-line command as one paste and one submission', () => {
    expect(shellCommandInput('for f in *; do\n  echo "$f"\ndone'))
      .toBe('\u{1B}[200~for f in *; do\n  echo "$f"\ndone\u{1B}[201~\r');
  });
});
