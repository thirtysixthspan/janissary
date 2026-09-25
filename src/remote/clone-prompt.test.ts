import { describe, it, expect } from 'vitest';
import { cloneAnswerEcho, cloneKeyAnswer, clonePromptText, cloningLine } from './clone-prompt.js';

const URL = 'https://github.com/owner/repo.git';

describe('clonePromptText', () => {
  it('asks about a missing path by name', () => {
    expect(clonePromptText({ path: '/srv/proj', url: URL }))
      .toBe(`/srv/proj is not a clone of this project. Clone ${URL} into /srv/proj? [y/N] `);
  });

  it('asks about a home-directory target by the home it looked in', () => {
    expect(clonePromptText({ path: '/home/ada/repo', url: URL, home: '/home/ada' }))
      .toBe(`/home/ada has no clone of this project. Clone ${URL} into /home/ada/repo? [y/N] `);
  });
});

describe('cloningLine', () => {
  it('names the url and the folder', () => {
    expect(cloningLine({ path: '/srv/proj', url: URL })).toBe(`Cloning ${URL} into /srv/proj…\r\n`);
  });
});

describe('cloneAnswerEcho', () => {
  it('echoes y or n and a newline', () => {
    expect(cloneAnswerEcho(true)).toBe('y\r\n');
    expect(cloneAnswerEcho(false)).toBe('n\r\n');
  });
});

describe('cloneKeyAnswer', () => {
  it.each(['y', 'Y'])('accepts %j', (key) => {
    expect(cloneKeyAnswer(key)).toBe('accept');
  });

  it.each(['n', 'N', '\r', '\n', '\u{1B}', '\u{3}'])('declines %j', (key) => {
    expect(cloneKeyAnswer(key)).toBe('decline');
  });

  it.each(['x', ' ', '1', '\u{1B}[A', '\u{7F}', ''])('ignores %j', (key) => {
    expect(cloneKeyAnswer(key)).toBe('ignore');
  });

  it('answers with the first deciding key in a chunk', () => {
    expect(cloneKeyAnswer('xyn')).toBe('accept');
    expect(cloneKeyAnswer('qN')).toBe('decline');
  });
});
