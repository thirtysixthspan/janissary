import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { guardOverlay } from './guarded-overlay';
import type { ContributedOverlay } from '../shared/contributed-overlays';

afterEach(() => { cleanup(); });

function overlay(overrides: Partial<ContributedOverlay> = {}): ContributedOverlay {
  return {
    name: 'fixture', claimsCommandBar: true, render: () => <p>history</p>, onKey: () => {}, onOpen: () => {},
    ...overrides,
  };
}

function Broken(): React.ReactNode {
  throw new Error('row renderer broke');
}

describe('guardOverlay', () => {
  it('passes every call through unchanged while nothing throws', () => {
    const onKey = vi.fn();
    const onOpen = vi.fn();
    const fail = vi.fn();
    const guarded = guardOverlay(overlay({ onKey, onOpen }), fail);
    const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });

    render(<>{guarded.render(null)}</>);
    guarded.onKey(event);
    guarded.onOpen();

    expect(screen.getByText('history')).toBeTruthy();
    expect(onKey).toHaveBeenCalledWith(event);
    expect(onOpen).toHaveBeenCalledOnce();
    expect(fail).not.toHaveBeenCalled();
    expect(guarded).toMatchObject({ name: 'fixture', claimsCommandBar: true });
  });

  // A throw while rendering used to unmount the whole React root — a blank window over one plugin.
  it('contains a render function that throws, and reports it', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fail = vi.fn();
    const guarded = guardOverlay(overlay({ render: () => { throw new Error('render broke'); } }), fail);

    render(<div><span>app</span>{guarded.render(null)}</div>);

    expect(screen.getByText('app')).toBeTruthy();
    expect(fail).toHaveBeenCalledWith('render broke');
  });

  it('contains a component the overlay rendered that throws, and reports it', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fail = vi.fn();
    const guarded = guardOverlay(overlay({ render: () => <Broken /> }), fail);

    render(<div><span>app</span>{guarded.render(null)}</div>);

    expect(screen.getByText('app')).toBeTruthy();
    expect(fail).toHaveBeenCalledWith('row renderer broke');
  });

  // The window key handler calls `onKey` on every keystroke while the overlay is up.
  it('keeps a throwing key handler from escaping, and reports it', () => {
    const fail = vi.fn();
    const guarded = guardOverlay(overlay({ onKey: () => { throw new Error('key broke'); } }), fail);

    expect(() => { guarded.onKey(new KeyboardEvent('keydown', { key: 'Enter' })); }).not.toThrow();
    expect(fail).toHaveBeenCalledWith('key broke');
  });

  it('keeps a throwing open hook from escaping, and reports it', () => {
    const fail = vi.fn();
    const guarded = guardOverlay(overlay({ onOpen: () => { throw new Error('open broke'); } }), fail);

    expect(() => { guarded.onOpen(); }).not.toThrow();
    expect(fail).toHaveBeenCalledWith('open broke');
  });
});
