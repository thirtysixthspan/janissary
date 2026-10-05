import React, { useRef } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COMMAND_BAR_HEIGHT, useCommandBarInset } from './useCommandBarInset';

const observers: { callback: () => void; disconnected: boolean }[] = [];

function Bar() {
  const root = useRef<HTMLDivElement>(null);
  useCommandBarInset(root);
  return <div ref={root} data-testid="bar" />;
}

function frameAround(className: string) {
  return render(<div className={className} data-testid="frame"><div><Bar /></div></div>);
}

function setHeight(element: HTMLElement, height: number) {
  Object.defineProperty(element, 'offsetHeight', { configurable: true, value: height });
}

describe('useCommandBarInset', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    observers.length = 0;
  });

  function stubResizeObserver() {
    vi.stubGlobal('ResizeObserver', class {
      private readonly entry: { callback: () => void; disconnected: boolean };
      constructor(callback: () => void) {
        this.entry = { callback, disconnected: false };
        observers.push(this.entry);
      }
      observe() {}
      disconnect() { this.entry.disconnected = true; }
    });
  }

  it('publishes the bar height on the tab frame around it and follows it as it resizes', () => {
    stubResizeObserver();
    const view = frameAround('tab-body');
    const frame = view.getByTestId('frame');

    expect(frame.style.getPropertyValue(COMMAND_BAR_HEIGHT)).toBe('0px');

    setHeight(view.getByTestId('bar'), 57);
    observers[0].callback();

    expect(frame.style.getPropertyValue(COMMAND_BAR_HEIGHT)).toBe('57px');
  });

  it('publishes on a docked plugin frame too', () => {
    stubResizeObserver();
    const view = frameAround('sidebar-plugin');

    expect(view.getByTestId('frame').style.getPropertyValue(COMMAND_BAR_HEIGHT)).toBe('0px');
  });

  it('removes the height and stops observing when the bar unmounts', () => {
    stubResizeObserver();
    const view = frameAround('tab-body');
    const frame = view.getByTestId('frame');

    view.unmount();

    expect(frame.style.getPropertyValue(COMMAND_BAR_HEIGHT)).toBe('');
    expect(observers[0].disconnected).toBe(true);
  });

  it('publishes on the host frame when a plugin draws its own tab body inside it', () => {
    stubResizeObserver();
    const view = render(
      <div className="tab-body" data-testid="frame">
        <div className="tab-body shell-tab" data-testid="plugin"><Bar /></div>
      </div>,
    );
    const frame = view.getByTestId('frame');
    const plugin = view.getByTestId('plugin');

    setHeight(view.getByTestId('bar'), 41);
    observers[0].callback();

    expect(frame.style.getPropertyValue(COMMAND_BAR_HEIGHT)).toBe('41px');
    expect(plugin.style.getPropertyValue(COMMAND_BAR_HEIGHT)).toBe('');

    view.unmount();

    expect(frame.style.getPropertyValue(COMMAND_BAR_HEIGHT)).toBe('');
  });

  it('publishes on the docked frame when a plugin draws its own tab body inside it', () => {
    stubResizeObserver();
    const view = render(
      <div className="sidebar-plugin" data-testid="frame">
        <div className="tab-body shell-tab" data-testid="plugin"><Bar /></div>
      </div>,
    );

    expect(view.getByTestId('frame').style.getPropertyValue(COMMAND_BAR_HEIGHT)).toBe('0px');
    expect(view.getByTestId('plugin').style.getPropertyValue(COMMAND_BAR_HEIGHT)).toBe('');
  });

  it('publishes nothing outside a tab frame', () => {
    stubResizeObserver();
    const view = frameAround('elsewhere');

    expect(view.getByTestId('frame').style.getPropertyValue(COMMAND_BAR_HEIGHT)).toBe('');
    expect(observers).toHaveLength(0);
  });
});
