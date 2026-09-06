import { describe, expect, it } from 'vitest';
import { endedCleanly, processEndDetail, withEndDetail, withoutChromiumEndLine } from './e2e-exit.js';

describe('processEndDetail', () => {
  // A process killed by a signal is reported with a code as well, and the code is the uninteresting
  // half — the signal is the thing that happened to it.
  it('names the signal when both a signal and a code are present', () => {
    expect(processEndDetail({ code: 1, signal: 'SIGKILL' })).toBe('signal SIGKILL');
  });

  it('names the signal on its own', () => {
    expect(processEndDetail({ code: null, signal: 'SIGSEGV' })).toBe('signal SIGSEGV');
  });

  it('names a non-zero code', () => {
    expect(processEndDetail({ code: 1, signal: null })).toBe('code 1');
  });

  // Zero is a status, not the absence of one: it is what says the shutdown was graceful.
  it('names a zero code rather than treating it as nothing to say', () => {
    expect(processEndDetail({ code: 0, signal: null })).toBe('code 0');
  });

  it('has nothing to say when neither is known', () => {
    expect(processEndDetail({ code: null, signal: null })).toBeUndefined();
    expect(processEndDetail({})).toBeUndefined();
  });
});

describe('withEndDetail', () => {
  it('appends the status in parentheses', () => {
    expect(withEndDetail('e2e browser exited', { code: 1, signal: null }))
      .toBe('e2e browser exited (code 1)');
    expect(withEndDetail('chromium exited', { code: null, signal: 'SIGKILL' }))
      .toBe('chromium exited (signal SIGKILL)');
  });

  // The wording every one of these messages had before a status was available. A report with
  // nothing to add has to keep reading exactly as it always did.
  it('leaves the message untouched when there is no status', () => {
    expect(withEndDetail('e2e browser exited', {})).toBe('e2e browser exited');
  });
});

describe('endedCleanly', () => {
  it('is true only for a zero code with no signal', () => {
    expect(endedCleanly({ code: 0, signal: null })).toBe(true);
  });

  it('is false for a non-zero code', () => {
    expect(endedCleanly({ code: 1, signal: null })).toBe(false);
  });

  it('is false for a signal, whatever the code says', () => {
    expect(endedCleanly({ code: 0, signal: 'SIGKILL' })).toBe(false);
  });

  // An end nobody can account for is not evidence of a graceful one.
  it('is false when the platform reported no status at all', () => {
    expect(endedCleanly({ code: null, signal: null })).toBe(false);
  });
});

describe('withoutChromiumEndLine', () => {
  it('drops the end report in each form it takes', () => {
    expect(withoutChromiumEndLine('chromium exited (signal SIGSEGV)')).toBe('');
    expect(withoutChromiumEndLine('chromium exited (code 1)')).toBe('');
    expect(withoutChromiumEndLine('chromium exited')).toBe('');
  });

  it('keeps what the browser said above it, with no blank line left behind', () => {
    expect(withoutChromiumEndLine('Received signal 11 SEGV_MAPERR\nchromium exited (signal SIGSEGV)'))
      .toBe('Received signal 11 SEGV_MAPERR');
  });

  it('drops the report from between two things the browser said', () => {
    expect(withoutChromiumEndLine('first\nchromium exited (code 1)\nsecond')).toBe('first\nsecond');
  });

  // Only the child's own report goes. A line that happens to name chromium is the browser talking,
  // which is the whole of what the tail exists to carry.
  it('leaves a line that merely mentions chromium alone', () => {
    expect(withoutChromiumEndLine('chromium exited unexpectedly, restarting'))
      .toBe('chromium exited unexpectedly, restarting');
    expect(withoutChromiumEndLine('chromium: crashed on startup')).toBe('chromium: crashed on startup');
  });

  it('has nothing to do with an empty tail', () => {
    expect(withoutChromiumEndLine('')).toBe('');
  });
});
