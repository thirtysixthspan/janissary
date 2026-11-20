import { describe, expect, it } from 'vitest';
import { extractCommandBlock } from './command-block.js';

describe('extractCommandBlock', () => {
  it('returns the whole trimmed block as one command with its span', () => {
    const block = '```janissary\nnotify hello\n```';
    const text = `Intro\n\n${block}\n\nOutro`;
    expect(extractCommandBlock(text, true)).toEqual({
      kind: 'one',
      command: 'notify hello',
      span: { start: text.indexOf(block), end: text.indexOf(block) + block.length },
    });
  });

  it('uses the last closed labelled block and ignores earlier or unlabelled blocks', () => {
    const last = '```janissary\nnotify final\n```';
    const text = [
      '```janissary',
      'notify earlier',
      '```',
      '```js',
      'notify example',
      '```',
      last,
    ].join('\n');
    expect(extractCommandBlock(text, true)).toEqual({
      kind: 'one',
      command: 'notify final',
      span: { start: text.indexOf(last), end: text.indexOf(last) + last.length },
    });
  });

  it('reports zero commands for an unclosed labelled block and absent for no labelled fence', () => {
    expect(extractCommandBlock('```janissary\nnotify hello', true)).toEqual({ kind: 'mistake', commands: 0 });
    expect(extractCommandBlock('Just a final answer.', true)).toEqual({ kind: 'absent' });
  });

  it('treats other info strings as ordinary examples', () => {
    expect(extractCommandBlock('```\nnotify example\n```', true)).toEqual({ kind: 'absent' });
    expect(extractCommandBlock('```janissary sh\nnotify example\n```', true)).toEqual({ kind: 'absent' });
    expect(extractCommandBlock('```Janissary\nnotify example\n```', true)).toEqual({ kind: 'absent' });
  });

  it('ignores a bare command line outside a labelled block, even as the final line', () => {
    expect(extractCommandBlock('Answer\nnotify final', true)).toEqual({ kind: 'absent' });
  });

  it('reports a mistake for zero and for more than one command-start line', () => {
    expect(extractCommandBlock('```janissary\njust prose\n```', true)).toEqual({ kind: 'mistake', commands: 0 });
    expect(extractCommandBlock('```janissary\nnotify one\ntab two\n```', true)).toEqual({ kind: 'mistake', commands: 2 });
  });

  it('preserves multi-line arguments with internal newlines', () => {
    const text = '```janissary\nquestion approve "Pick one\nthat spans lines" alpha beta\n```';
    expect(extractCommandBlock(text, true)).toMatchObject({
      kind: 'one',
      command: 'question approve "Pick one\nthat spans lines" alpha beta',
    });
  });

  it('does not let prose after the block suppress the command', () => {
    expect(extractCommandBlock('```janissary\nnotify hello\n```\n\nDone.', true)).toMatchObject({
      kind: 'one',
      command: 'notify hello',
    });
  });

  it('strips a leading janissary prefix from the returned command', () => {
    expect(extractCommandBlock('```janissary\njanissary notify hello\n```', true)).toMatchObject({
      kind: 'one',
      command: 'notify hello',
    });
  });

  it('honours allowQuestion for a question command-start line', () => {
    const text = '```janissary\nquestion ask "why"\n```';
    expect(extractCommandBlock(text, false)).toEqual({ kind: 'mistake', commands: 0 });
    expect(extractCommandBlock(text, true)).toMatchObject({ kind: 'one', command: 'question ask "why"' });
  });

  it('accepts tilde and backtick fences and requires a matching closing marker', () => {
    expect(extractCommandBlock('~~~janissary\nnotify hello\n~~~', true)).toMatchObject({
      kind: 'one', command: 'notify hello',
    });
    expect(extractCommandBlock('```janissary\nnotify hello\n~~~', true)).toEqual({ kind: 'mistake', commands: 0 });
    expect(extractCommandBlock('````janissary\nnotify hello\n```', true)).toEqual({ kind: 'mistake', commands: 0 });
  });
});
