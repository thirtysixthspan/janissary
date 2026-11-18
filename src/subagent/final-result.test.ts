import { describe, expect, it } from 'vitest';
import { extractFinalResult } from './final-result.js';

describe('extractFinalResult', () => {
  it('returns the trimmed contents of one tag pair', () => {
    expect(extractFinalResult('before\n<final_result>\n  The answer.\n</final_result>\nafter')).toBe('The answer.');
  });

  it('takes the contents of the last complete tag pair', () => {
    const text = '<final_result>first</final_result>\n<final_result>second</final_result>';
    expect(extractFinalResult(text)).toBe('second');
  });

  it('drops reasoning and tool-call text outside the tags', () => {
    const text = 'Let me think.\nTool: file read x.md\n<final_result>Only this</final_result>';
    expect(extractFinalResult(text)).toBe('Only this');
  });

  it('returns the text unchanged when there is no tag pair', () => {
    expect(extractFinalResult('  Final  answer\n')).toBe('  Final  answer\n');
    expect(extractFinalResult(' '.repeat(3))).toBe(' '.repeat(3));
    expect(extractFinalResult('')).toBe('');
  });

  it('returns an empty result for an empty tag pair', () => {
    expect(extractFinalResult('<final_result>   </final_result>')).toBe('');
  });

  it('keeps multiline contents', () => {
    expect(extractFinalResult('<final_result>\nline one\nline two\n</final_result>')).toBe('line one\nline two');
  });

  it('matches tags case-insensitively', () => {
    expect(extractFinalResult('<FINAL_RESULT>Mixed</FINAL_RESULT>')).toBe('Mixed');
  });

  it('leaves an unclosed tag untouched', () => {
    const text = 'reasoning\n<final_result>no closing tag';
    expect(extractFinalResult(text)).toBe(text);
  });
});
