import { describe, expect, it } from 'vitest';
import { backgroundOf } from './download';

// A raster export is a picture of a chart with nothing behind it, so whatever the chart is drawn on has to
// be laid down first. These cases are about which colour that is, and the two candidates are not close:
// the theme's own page colour, or the chart element's computed background - which is transparent in
// practice, and transparent is not a colour a near-white axis line can be read against.

function style(declared: Record<string, string>): { getPropertyValue: (name: string) => string } {
  return { getPropertyValue: (name) => declared[name] ?? '' };
}

describe('backgroundOf', () => {
  it('paints with the theme background, not the element background', () => {
    expect(backgroundOf(style({ '--bg': '#101014' }))).toBe('#101014');
  });

  // A declared property arrives with whatever whitespace the stylesheet gave it, and a fillStyle of
  // ' #101014' is not a colour the canvas will accept.
  it('takes the declared value as it is written, without its surrounding space', () => {
    expect(backgroundOf(style({ '--bg': '  #101014\n' }))).toBe('#101014');
  });

  it('falls back to white when the theme declares no background', () => {
    expect(backgroundOf(style({}))).toBe('#ffffff');
    expect(backgroundOf(style({ '--bg': ' '.repeat(3) }))).toBe('#ffffff');
  });

  // A theme may set `--bg` to transparent deliberately, for a surface that is dark whatever is behind
  // it. An exported file has no such surface: it lands in a viewer that draws white, so a transparent
  // fill is the near-white axis line on nothing, which is the failure this whole line exists to prevent.
  it('falls back when the theme background is transparent', () => {
    expect(backgroundOf(style({ '--bg': 'transparent' }))).toBe('#ffffff');
    expect(backgroundOf(style({ '--bg': 'rgba(0, 0, 0, 0)' }))).toBe('#ffffff');
  });

  it('keeps a background it can actually paint with', () => {
    expect(backgroundOf(style({ '--bg': 'oklch(0.18 0.01 260)' }))).toBe('oklch(0.18 0.01 260)');
  });
});
