import { describe, expect, it } from 'vitest';
import { OUTSIDE_ROOT_REASON } from '../file-navigator/file-operation-result.js';
import { applyingFailureLine, malformedPatchLine, patchSuccessText, sectionFailureLine, withFinalPeriod } from './messages.js';

describe('patch messages', () => {
  it('formats counts, rows, and escaped paths', () => {
    expect(patchSuccessText([])).toBe('Patched 0 files:');
    expect(patchSuccessText([{ letter: 'A', path: 'a\tb' }])).toBe('Patched 1 file:\nA a\\tb');
    expect(patchSuccessText([{ letter: 'M', path: 'x' }, { letter: 'R', path: 'a\nb', target: 'c\td' }]))
      .toBe('Patched 2 files:\nM x\nR a\\nb -> c\\td');
  });

  it('escapes failures and normalizes periods and outside-root reasons', () => {
    expect(withFinalPeriod('a')).toBe('a.');
    expect(withFinalPeriod('a.')).toBe('a.');
    expect(malformedPatchLine({ line: 2, problem: 'bad\tline.' })).toBe(String.raw`Malformed patch at line 2: bad\tline. No files were changed.`);
    expect(sectionFailureLine({ ok: false, section: 1, marker: 'Update\tFile', hunkLine: 'a\nb' }))
      .toBe(String.raw`Patch failed at section 1 (Update\tFile): No matching text for hunk starting "a\nb". No files were changed.`);
    expect(sectionFailureLine({ ok: false, section: 2, marker: 'x', reason: OUTSIDE_ROOT_REASON }))
      .toBe('Patch failed at section 2 (x): Outside the workspace. No files were changed.');
    expect(sectionFailureLine({ ok: false, section: 1, marker: 'x', reason: 'bad.' }))
      .toBe('Patch failed at section 1 (x): bad. No files were changed.');
  });

  it('reports both commit outcomes with escaped reason and path', () => {
    expect(applyingFailureLine({ ok: false, restored: true, reason: 'bad\nreason', path: 'a\tb' }))
      .toBe(String.raw`Patch failed while applying: bad\nreason: a\tb. No files were changed.`);
    expect(applyingFailureLine({ ok: false, restored: false, reason: OUTSIDE_ROOT_REASON, path: 'a' }))
      .toBe('Patch failed while applying: Outside the workspace: a. Some files may have been changed.');
  });
});
