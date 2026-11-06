import { describe, expect, it } from 'vitest';
import {
  addBusy, appendContext, clearBusy, contextFor, cwdOf, deleteBusy, isBusy, setContext, setCwd,
} from './runtime-operations.js';
import type { Tab } from './types.js';

function tab(label: string): Tab {
  return { label, runtime: { busy: false, cwd: '/original', context: ['first'], queue: [] } } as unknown as Tab;
}

// Every setter here is guarded on the label naming a tab. A label that names none is a tab that
// closed between the request arriving and the runtime being touched, and it must leave the rest of
// the tab list alone rather than create a runtime for a tab that is not there.
describe('runtime accessors with no tab behind the label', () => {
  const empty: Tab[] = [];

  it('answers a default rather than throwing for a label no tab carries', () => {
    expect(isBusy(empty, 'gone')).toBe(false);
    expect(cwdOf(empty, 'gone')).toBeUndefined();
    expect(contextFor(empty, 'gone')).toEqual([]);
  });

  it('writes nothing for a label no tab carries', () => {
    expect(() => {
      setCwd(empty, 'gone', '/elsewhere');
      addBusy(empty, 'gone');
      addBusy(empty, 'gone', {});
      setContext(empty, 'gone', ['x']);
      appendContext(empty, 'gone', 'x');
    }).not.toThrow();
    expect(empty).toEqual([]);
  });
});

describe('runtime accessors', () => {
  it('reports a tab as not busy until something marks it', () => {
    const tabs = [tab('agent')];
    expect(isBusy(tabs, 'agent')).toBe(false);

    addBusy(tabs, 'agent');

    expect(isBusy(tabs, 'agent')).toBe(true);
  });

  it('reads and replaces a tab\'s working directory', () => {
    const tabs = [tab('agent')];
    expect(cwdOf(tabs, 'agent')).toBe('/original');

    setCwd(tabs, 'agent', '/moved');

    expect(cwdOf(tabs, 'agent')).toBe('/moved');
  });

  it('leaves other tabs\' runtimes alone', () => {
    const tabs = [tab('a'), tab('b')];
    setCwd(tabs, 'a', '/moved');
    addBusy(tabs, 'a');
    expect(cwdOf(tabs, 'b')).toBe('/original');
    expect(isBusy(tabs, 'b')).toBe(false);
  });

  // The busy mark is a latch: it is set when work starts and cleared when it stops, so the badge
  // cannot go stale in the busy direction.
  it('clears the busy mark a tab was carrying', () => {
    const tabs = [tab('agent')];
    addBusy(tabs, 'agent');

    deleteBusy(tabs, 'agent');

    expect(isBusy(tabs, 'agent')).toBe(false);
  });

  it('keeps the projection busy until every owner releases its own activity', () => {
    const tabs = [tab('agent')];
    const shell = {};
    const ask = {};

    addBusy(tabs, 'agent', shell);
    addBusy(tabs, 'agent', ask);
    deleteBusy(tabs, 'agent', shell);

    expect(isBusy(tabs, 'agent')).toBe(true);
    deleteBusy(tabs, 'agent', {});
    expect(isBusy(tabs, 'agent')).toBe(true);
    deleteBusy(tabs, 'agent', ask);
    expect(isBusy(tabs, 'agent')).toBe(false);
  });

  it('keeps unowned activity active while an owner releases its work', () => {
    const tabs = [tab('agent')];
    const shell = {};

    addBusy(tabs, 'agent');
    addBusy(tabs, 'agent', shell);
    deleteBusy(tabs, 'agent', shell);

    expect(isBusy(tabs, 'agent')).toBe(true);
    deleteBusy(tabs, 'agent');
    expect(isBusy(tabs, 'agent')).toBe(false);
  });

  it('clears all owners and unowned activity at a terminal boundary', () => {
    const tabs = [tab('agent')];

    addBusy(tabs, 'agent');
    addBusy(tabs, 'agent', {});
    clearBusy(tabs, 'agent');

    expect(isBusy(tabs, 'agent')).toBe(false);
  });
});

describe('tab context', () => {
  it('reads the context a tab has accumulated', () => {
    const tabs = [tab('agent')];
    expect(contextFor(tabs, 'agent')).toEqual(['first']);
  });

  it('replaces a tab\'s context outright', () => {
    const tabs = [tab('agent')];

    setContext(tabs, 'agent', ['a', 'b']);

    expect(contextFor(tabs, 'agent')).toEqual(['a', 'b']);
  });

  it('appends to a tab\'s context without disturbing what was there', () => {
    const tabs = [tab('agent')];

    appendContext(tabs, 'agent', 'second');

    expect(contextFor(tabs, 'agent')).toEqual(['first', 'second']);
  });

  it('starts from nothing where a tab has no context yet', () => {
    const bare = { label: 'bare' } as unknown as Tab;
    const tabs = [bare];

    appendContext(tabs, 'bare', 'first');

    expect(contextFor(tabs, 'bare')).toEqual(['first']);
  });
});
