import { describe, expect, it } from 'vitest';
import { extractCommandBlock } from './command-block.js';

describe('extractCommandBlock', () => {
  it('returns the whole trimmed block as a one-entry batch with its span', () => {
    const block = '```janissary\nnotify hello\n```';
    const text = `Intro\n\n${block}\n\nOutro`;
    expect(extractCommandBlock(text, true)).toEqual({
      kind: 'batch',
      commands: [{
        command: 'notify hello',
        span: { start: text.indexOf(block), end: text.indexOf(block) + block.length },
      }],
    });
  });

  it('returns every labelled block with its own span, in appearance order', () => {
    const first = '```janissary\nnotify one\n```';
    const second = '```janissary\nnotify two\n```';
    const text = [
      'Intro',
      first,
      '```js',
      'notify ignored',
      '```',
      second,
      'Outro',
    ].join('\n');
    expect(extractCommandBlock(text, true)).toEqual({
      kind: 'batch',
      commands: [
        { command: 'notify one', span: { start: text.indexOf(first), end: text.indexOf(first) + first.length } },
        { command: 'notify two', span: { start: text.indexOf(second), end: text.indexOf(second) + second.length } },
      ],
    });
  });

  it('ignores prose between and after blocks without suppressing any block', () => {
    const text = [
      'Before',
      '```janissary', 'notify first', '```',
      'Between prose with a bare notify second line',
      '```janissary', 'notify third', '```',
      'After',
    ].join('\n');
    expect(extractCommandBlock(text, true)).toMatchObject({
      kind: 'batch',
      commands: [{ command: 'notify first' }, { command: 'notify third' }],
    });
  });

  it('reports a mistake for an unclosed labelled block even when an earlier block closed', () => {
    const first = '```janissary\nnotify hello\n```';
    const text = [first, '```janissary', 'notify never-closed'].join('\n');
    expect(extractCommandBlock(text, true)).toEqual({ kind: 'mistake', commands: 0 });
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

  it('treats a bad block anywhere in a reply as a whole-reply mistake', () => {
    const empty = [
      '```janissary', 'notify first', '```',
      '```janissary', 'just prose', '```',
    ].join('\n');
    expect(extractCommandBlock(empty, true)).toEqual({ kind: 'mistake', commands: 0 });
    const two = [
      '```janissary', 'notify first', '```',
      '```janissary', 'notify one', 'tab two', '```',
    ].join('\n');
    expect(extractCommandBlock(two, true)).toEqual({ kind: 'mistake', commands: 2 });
  });

  it('preserves multi-line arguments with internal newlines', () => {
    const text = '```janissary\nquestion approve "Pick one\nthat spans lines" alpha beta\n```';
    expect(extractCommandBlock(text, true)).toMatchObject({
      kind: 'batch',
      commands: [{ command: 'question approve "Pick one\nthat spans lines" alpha beta' }],
    });
  });

  it('does not let prose after the block suppress the command', () => {
    expect(extractCommandBlock('```janissary\nnotify hello\n```\n\nDone.', true)).toMatchObject({
      kind: 'batch',
      commands: [{ command: 'notify hello' }],
    });
  });

  it('strips a leading janissary prefix from the returned command', () => {
    expect(extractCommandBlock('```janissary\njanissary notify hello\n```', true)).toMatchObject({
      kind: 'batch',
      commands: [{ command: 'notify hello' }],
    });
  });

  it('recognizes one leading slash on a block command without changing the returned text', () => {
    expect(extractCommandBlock('```janissary\n/file read a.md\n```', true)).toMatchObject({
      kind: 'batch',
      commands: [{ command: '/file read a.md' }],
    });
    expect(extractCommandBlock('```janissary\n//file read a.md\n```', true)).toEqual({ kind: 'mistake', commands: 0 });
  });

  it('honours allowQuestion for a question command-start line', () => {
    const text = '```janissary\nquestion ask "why"\n```';
    expect(extractCommandBlock(text, false)).toEqual({ kind: 'mistake', commands: 0 });
    expect(extractCommandBlock(text, true)).toMatchObject({
      kind: 'batch',
      commands: [{ command: 'question ask "why"' }],
    });
  });

  it('does not require the janissary marker inside a labelled block but still strips it when present', () => {
    expect(extractCommandBlock('```janissary\nquestion ask "old"\n```', true)).toMatchObject({
      kind: 'batch', commands: [{ command: 'question ask "old"' }],
    });
    expect(extractCommandBlock('```janissary\njanissary question ask "old"\n```', true)).toMatchObject({
      kind: 'batch', commands: [{ command: 'question ask "old"' }],
    });
  });

  it('does not extract a bare final command line outside a labelled block', () => {
    expect(extractCommandBlock('Answer\njanissary question ask "real"', true)).toEqual({ kind: 'absent' });
    expect(extractCommandBlock('Answer\nquestion ask "real"', true)).toEqual({ kind: 'absent' });
  });

  it('reads every closed tilde-fenced labelled block alongside backtick ones', () => {
    expect(extractCommandBlock('~~~text\nquestion ask "hidden"\n~~~', true)).toEqual({ kind: 'absent' });
    expect(extractCommandBlock('~~~\nquestion ask "hidden"\n~~~', true)).toEqual({ kind: 'absent' });
    expect(extractCommandBlock('~~~janissary\nquestion ask "real"\n~~~', true)).toMatchObject({
      kind: 'batch', commands: [{ command: 'question ask "real"' }],
    });
    expect(extractCommandBlock(
      '~~~janissary\nquestion ask "hidden"\n~~~\n```janissary\nquestion ask "real"\n```', true,
    )).toMatchObject({
      kind: 'batch',
      commands: [{ command: 'question ask "hidden"' }, { command: 'question ask "real"' }],
    });
  });

  it('accepts tilde and backtick fences and requires a matching closing marker', () => {
    expect(extractCommandBlock('~~~janissary\nnotify hello\n~~~', true)).toMatchObject({
      kind: 'batch', commands: [{ command: 'notify hello' }],
    });
    expect(extractCommandBlock('```janissary\nnotify hello\n~~~', true)).toEqual({ kind: 'mistake', commands: 0 });
    expect(extractCommandBlock('````janissary\nnotify hello\n```', true)).toEqual({ kind: 'mistake', commands: 0 });
  });
});
