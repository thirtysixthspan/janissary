import { describe, it, expect } from 'vitest';
import { command, parseClose } from './close.js';

describe('close command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('close');
  });

  it('matches "close" case-insensitively', () => {
    expect(command.match('close')).toBe(true);
    expect(command.match('CLOSE')).toBe(true);
    expect(command.match('Close')).toBe(true);
  });

  it('matches "close page n" with the broadened matcher', () => {
    expect(command.match('close page 1')).toBe(true);
    expect(command.match('CLOSE PAGE 3')).toBe(true);
  });

  it('matches "exit" case-insensitively, as an alias of close', () => {
    expect(command.match('exit')).toBe(true);
    expect(command.match('EXIT')).toBe(true);
    expect(command.match('exit page 2')).toBe(true);
  });

  it('does not match non-close input', () => {
    expect(command.match('closer')).toBe(false);
    expect(command.match('clos')).toBe(false);
    expect(command.match('exits')).toBe(false);
    expect(command.match('quit')).toBe(false);
  });
});

describe('parseClose', () => {
  it('returns active for bare close', () => {
    expect(parseClose('close')).toEqual({ target: 'active' });
  });

  // A page tab is a plugin tab now, named `page`, `page-2`, … like every other plugin tab, so it is
  // closed by that label rather than by a page number the app no longer assigns.
  it('returns tabname target for "close page"', () => {
    expect(parseClose('close page')).toEqual({ target: 'tabname', name: 'page' });
  });

  it('returns tabname target for "close page-2"', () => {
    expect(parseClose('close page-2')).toEqual({ target: 'tabname', name: 'page-2' });
  });

  it('is case-insensitive on the close keyword', () => {
    expect(parseClose('CLOSE page-2')).toEqual({ target: 'tabname', name: 'page-2' });
  });

  it('returns tabname target for "close page abc"', () => {
    expect(parseClose('close page abc')).toEqual({ target: 'tabname', name: 'page abc' });
  });

  it('returns tabname target for "close <name>"', () => {
    expect(parseClose('close tab 2')).toEqual({ target: 'tabname', name: 'tab 2' });
  });

  it('returns tabname target for single-word tab name', () => {
    expect(parseClose('close janus')).toEqual({ target: 'tabname', name: 'janus' });
  });

  it('returns tabname target for multi-word tab name', () => {
    expect(parseClose('close my tab')).toEqual({ target: 'tabname', name: 'my tab' });
  });

  it('treats "exit" as an alias of "close"', () => {
    expect(parseClose('exit')).toEqual({ target: 'active' });
    expect(parseClose('EXIT page-2')).toEqual({ target: 'tabname', name: 'page-2' });
  });
});
