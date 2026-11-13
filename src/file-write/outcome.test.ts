import { describe, expect, it } from 'vitest';
import { SAVE_CONFLICT_ERROR } from '../editor/save-conflict.js';
import { fileOperationReason, OUTSIDE_ROOT_REASON } from '../file-navigator/file-operation-result.js';
import { CLOSED_REASON, ENDED_REASON, TIMED_OUT_REASON } from '../file-navigator/remote/port-requests.js';
import { mutationFailureLine, mutationRejectionLine } from './outcome.js';
import { MULTIPLE_MATCHES_REASON, NO_MATCHING_TEXT_REASON } from './types.js';

describe('mutationFailureLine', () => {
  it('maps both outside-root reasons to the workspace line', () => {
    expect(mutationFailureLine('Outside the workspace', '../x')).toBe('Outside the workspace: ../x.');
    expect(mutationFailureLine(OUTSIDE_ROOT_REASON, '../x')).toBe('Outside the workspace: ../x.');
  });

  it('prints a policy word, the save conflict, and a filesystem reason with the path', () => {
    expect(mutationFailureLine('Secret file', '.env')).toBe('Secret file: .env.');
    expect(mutationFailureLine(SAVE_CONFLICT_ERROR, 'a.md')).toBe(`${SAVE_CONFLICT_ERROR}: a.md.`);
    const reason = fileOperationReason({ code: 'EACCES' });
    expect(mutationFailureLine(reason, 'a.md')).toBe(`${reason}: a.md.`);
  });

  it('prints both match failures', () => {
    expect(mutationFailureLine(NO_MATCHING_TEXT_REASON, 'a.md')).toBe('No matching text: a.md.');
    expect(mutationFailureLine(MULTIPLE_MATCHES_REASON, 'a.md')).toBe('Multiple matches: a.md; set replaceAll to true.');
  });

  it('prints a remote connection reason unchanged', () => {
    expect(mutationFailureLine(ENDED_REASON, 'a.md')).toBe(ENDED_REASON);
  });

  it('escapes a reason and path containing newlines', () => {
    expect(mutationFailureLine('bad\nthing', 'a\nb')).toBe(String.raw`bad\nthing: a\nb.`);
  });
});

describe('mutationRejectionLine', () => {
  it('prints the remote rejection messages unchanged', () => {
    for (const message of ['Remote connection unavailable.', ENDED_REASON, TIMED_OUT_REASON, CLOSED_REASON]) {
      expect(mutationRejectionLine(new Error(message), 'a.md')).toBe(message);
    }
  });

  it('maps a remote outside-root rejection to the workspace line', () => {
    expect(mutationRejectionLine(new Error(OUTSIDE_ROOT_REASON), '../x')).toBe('Outside the workspace: ../x.');
  });

  it('prints an invalid remote result as a failure with the path', () => {
    expect(mutationRejectionLine(new Error('Invalid remote filesystem operation result.'), 'a.md'))
      .toBe('Invalid remote filesystem operation result.: a.md.');
  });

  it('prints a non-Error rejection through the filesystem reason', () => {
    expect(mutationRejectionLine({ code: 'ENOSPC' }, 'a.md')).toBe(`${fileOperationReason({ code: 'ENOSPC' })}: a.md.`);
  });
});
