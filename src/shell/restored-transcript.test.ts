import { describe, expect, it } from 'vitest';
import type { ShellHistoryRun } from '../remote/protocol-frames.js';
import { shellCommandInput, shellPwdQueryInput } from './command-input.js';
import { restoredTranscript } from './restored-transcript.js';

// The runs a peer retains for a piped shell, built through the very writers that produced them on the
// way out, so a change to the wrapper fails here rather than silently stopping the reader from
// recognizing a command.
function command(text: string, delimiter: string): ShellHistoryRun {
  return { source: 'input', text: shellCommandInput(text, delimiter) };
}

function pwdQuery(delimiter: string): ShellHistoryRun {
  return { source: 'input', text: shellPwdQueryInput(delimiter) };
}

function output(text: string): ShellHistoryRun {
  return { source: 'output', text };
}

describe('restoredTranscript', () => {
  it('pairs each retained command with the output it produced', () => {
    expect(restoredTranscript([
      command('ls', '__JS_END_3_1__'),
      output('src\nweb\n__JS_END_3_1__\n'),
      command('echo hi', '__JS_END_3_2__'),
      output('hi\n__JS_END_3_2__\n'),
    ])).toEqual([
      { input: 'ls', output: 'src\nweb' },
      { input: 'echo hi', output: 'hi' },
    ]);
  });

  it('reassembles output that arrived in several runs', () => {
    expect(restoredTranscript([
      command('ls', '__JS_END_3_1__'),
      output('src\n'),
      output('web\n'),
      output('__JS_END_3_1__\n'),
    ])).toEqual([{ input: 'ls', output: 'src\nweb' }]);
  });

  it('leaves a pwd query and its debris out of the transcript', () => {
    expect(restoredTranscript([
      command('ls', '__JS_END_3_1__'),
      output('web\n__JS_END_3_1__\n'),
      pwdQuery('__PWD_3_2__'),
      output('/remote/workspace/harun\n__PWD_3_2__\n'),
      command('ps', '__JS_END_3_3__'),
      output('not permitted\n__JS_END_3_3__\n'),
    ])).toEqual([
      { input: 'ls', output: 'web' },
      { input: 'ps', output: 'not permitted' },
    ]);
  });

  it('keeps output with no command ahead of it as a leading entry', () => {
    expect(restoredTranscript([
      output('[earlier remote history trimmed]\nhalf an answer\n'),
      command('ls', '__JS_END_3_1__'),
      output('web\n__JS_END_3_1__\n'),
    ])).toEqual([
      { input: '', output: '[earlier remote history trimmed]\nhalf an answer' },
      { input: 'ls', output: 'web' },
    ]);
  });

  it('keeps a command whose output never arrived', () => {
    expect(restoredTranscript([command('sleep 60', '__JS_END_3_1__')]))
      .toEqual([{ input: 'sleep 60', output: '' }]);
  });

  it('takes input it does not recognize at face value', () => {
    expect(restoredTranscript([
      { source: 'input', text: 'yes\n' },
      output('answered\n'),
    ])).toEqual([{ input: 'yes', output: 'answered' }]);
  });

  it('yields nothing for no runs and for runs holding nothing but sentinels', () => {
    expect(restoredTranscript([])).toEqual([]);
    expect(restoredTranscript([output('__JS_END_3_1__\n')])).toEqual([]);
  });
});
