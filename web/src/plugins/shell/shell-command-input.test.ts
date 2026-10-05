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

  it('keeps an embedded paste end marker from closing the paste early', () => {
    expect(shellCommandInput('a\u{1B}[201~\nb')).toBe('\u{1B}[200~a\nb\u{1B}[201~\r');
  });

  it('writes a single line without its escape and control characters', () => {
    expect(shellCommandInput('echo \u{1B}[2Jhi\u{3}')).toBe('echo hi\n');
  });
});
