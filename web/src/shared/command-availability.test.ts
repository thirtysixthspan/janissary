import { describe, expect, it } from 'vitest';
import type { DisabledApplicationCommand } from '@shared/protocol';
import { disabledApplicationCommand } from './command-availability';

const row = (
  name: string,
  forms: readonly string[],
  aliases: readonly string[] = [],
): DisabledApplicationCommand => ({ name, aliases, forms });

const theme = row('theme', ['theme', 'theme sync']);
const close = row('close', ['close'], ['exit']);
const quit = row('quit', ['quit']);
const searchBuiltin = row('search', ['search transcript']);
const searchPlugin = row('search', ['search']);
const question = row('question', ['question ask', 'question approve']);
const questionAsk = row('question ask', ['question ask']);
const questionApprove = row('question approve', ['question approve']);
const browser = row('browser', ['browser']);
const browserContent = row('browser content', ['browser content']);

describe('disabledApplicationCommand', () => {
  it('normalizes trimming, whitespace, case, and one leading slash', () => {
    expect(disabledApplicationCommand('/  THEME   SYNC  ', [theme])).toBe(theme);
    expect(disabledApplicationCommand('/theme', [theme])).toBe(theme);
    expect(disabledApplicationCommand('//theme', [theme])).toBeUndefined();
  });

  it('skips shell lines that start with !', () => {
    expect(disabledApplicationCommand('!quit', [quit])).toBeUndefined();
    expect(disabledApplicationCommand('! quit', [quit])).toBeUndefined();
  });

  it('matches an exact form or a whole-word prefix, not a longer word', () => {
    expect(disabledApplicationCommand('theme', [theme])).toBe(theme);
    expect(disabledApplicationCommand('theme sync nord', [theme])).toBe(theme);
    expect(disabledApplicationCommand('themed', [theme])).toBeUndefined();
  });

  it('matches aliases and fixed forms', () => {
    expect(disabledApplicationCommand('exit', [close])).toBe(close);
    expect(disabledApplicationCommand('exit now', [close])).toBe(close);
    expect(disabledApplicationCommand('browser content', [browserContent])).toBe(browserContent);
  });

  it('keeps shared search rows on one canonical name', () => {
    const rows = [searchBuiltin, searchPlugin];

    expect(disabledApplicationCommand('search transcript beta', rows)?.name).toBe('search');
    expect(disabledApplicationCommand('search beta', rows)?.name).toBe('search');
  });

  it('prefers a native question row over the builtin row that shares its form', () => {
    const rows = [question, questionAsk, questionApprove];

    expect(disabledApplicationCommand('question ask "Who?"', rows)).toBe(questionAsk);
    expect(disabledApplicationCommand('question approve "Who?" yes', rows)).toBe(questionApprove);
  });

  it('includes a disabled parent\'s child rows but not the child alone', () => {
    expect(disabledApplicationCommand('browser content', [browser, browserContent])).toBe(browserContent);
    expect(disabledApplicationCommand('browser', [browserContent])).toBeUndefined();
  });

  it('lets the longest matching form win', () => {
    const open = row('open', ['open']);
    const openPage = row('open page', ['open page']);

    expect(disabledApplicationCommand('open page example.com', [open, openPage])).toBe(openPage);
  });

  it('resolves nav, clip, and ordinary lines to nothing', () => {
    const rows = [theme, close, searchBuiltin, searchPlugin];

    expect(disabledApplicationCommand('nav shell', rows)).toBeUndefined();
    expect(disabledApplicationCommand('clip', rows)).toBeUndefined();
    expect(disabledApplicationCommand('ls -la', rows)).toBeUndefined();
  });
});
