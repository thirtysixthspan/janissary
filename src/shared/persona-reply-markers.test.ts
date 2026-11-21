import { describe, expect, it } from 'vitest';
import { captureMarker } from './persona-reply-markers.js';

describe('captureMarker', () => {
  it('captures a monitor-style multi-line field up to the next marker', () => {
    const reply = [
      '[SUMMARY]: Two parallel implementations underway:',
      '- one in the harness',
      '- one in the editor',
      '[SUGGESTION]: Take a closer look',
    ].join('\n');
    expect(captureMarker(reply, 'SUMMARY'))
      .toBe('Two parallel implementations underway:\n- one in the harness\n- one in the editor');
  });

  it('captures an editor-style multi-line field up to the next field', () => {
    const block = [
      '[ANCHOR]: const old = 1;',
      '  // keep this line',
      '[REPLACEMENT]: const next = 2;',
    ].join('\n');
    expect(captureMarker(block, 'ANCHOR')).toBe('const old = 1;\n  // keep this line');
  });

  it('does not let an empty in-line value swallow the following marker line', () => {
    expect(captureMarker('[SUGGESTION]:\n[COMMAND]: npm run build', 'SUGGESTION')).toBe('');
    expect(captureMarker('[ANCHOR]: \n[REPLACEMENT]: appended', 'ANCHOR')).toBe('');
  });

  it('captures a value that starts on the line after the marker', () => {
    expect(captureMarker('[SUMMARY]:\nfirst line\nsecond line', 'SUMMARY'))
      .toBe('first line\nsecond line');
  });

  it('returns undefined when the marker is absent', () => {
    expect(captureMarker('OK, nothing to report', 'SUMMARY')).toBeUndefined();
  });
});
