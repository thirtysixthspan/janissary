import { describe, expect, it } from 'vitest';
import { ReplyPlacement } from './reply-placement';

describe('ReplyPlacement', () => {
  it('writes an echo and lets its reply continue beneath it when nothing came between', () => {
    const placement = new ReplyPlacement();

    expect(placement.echo('acp hello')).toBe(true);
    expect(placement.reply('acp hello')).toBe(false);
  });

  it('repeats the line when anything reached the terminal after the echo', () => {
    const placement = new ReplyPlacement();
    placement.echo('acp hello');
    placement.wrote();

    expect(placement.reply('acp hello')).toBe(true);
  });

  it('repeats the line for a reply to a different command than the last echo', () => {
    const placement = new ReplyPlacement();
    placement.echo('acp first');
    placement.echo('acp second');

    expect(placement.reply('acp first')).toBe(true);
  });

  it('repeats the line for a reply with no echo before it', () => {
    expect(new ReplyPlacement().reply('help')).toBe(true);
  });

  it('consumes the echo, so a second reply to the same line repeats it', () => {
    const placement = new ReplyPlacement();
    placement.echo('acp hello');
    placement.reply('acp hello');

    expect(placement.reply('acp hello')).toBe(true);
  });

  it('skips the echo of a line whose reply was the last write, once', () => {
    const placement = new ReplyPlacement();
    placement.reply('acp reset');

    expect(placement.echo('acp reset')).toBe(false);
    expect(placement.echo('acp reset')).toBe(true);
  });

  it('writes the echo when output came between the reply and the dispatch answer', () => {
    const placement = new ReplyPlacement();
    placement.reply('acp reset');
    placement.wrote();

    expect(placement.echo('acp reset')).toBe(true);
  });

  it('counts a reply written beneath its echo as a write', () => {
    const placement = new ReplyPlacement();
    placement.echo('acp first');
    placement.reply('acp first');

    expect(placement.echo('acp second')).toBe(true);
    expect(placement.reply('acp second')).toBe(false);
  });
});
