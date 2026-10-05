import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import { useToastPosition } from './useToastPosition';

function element(className: string, bottom: number): HTMLElement {
  const node = document.createElement('div');
  node.className = className;
  node.getBoundingClientRect = () => ({
    x: 0, y: 0, left: 0, top: 0, right: 0, bottom, width: 0, height: bottom, toJSON: () => ({}),
  }) as DOMRect;
  return node;
}

function appWith(...children: HTMLElement[]): void {
  const app = document.createElement('div');
  app.className = 'app';
  app.append(...children);
  document.body.append(app);
}

describe('useToastPosition', () => {
  afterEach(() => {
    cleanup();
    document.body.replaceChildren();
  });

  it('starts the stack below the visible tab metadata row', () => {
    appWith(element('tab-meta', 62));

    const { result } = renderHook(() => useToastPosition());

    expect(result.current).toBe(70);
  });

  it('still clears a status panel that reaches further down than the metadata row', () => {
    const panels = document.createElement('div');
    panels.className = 'status-panels';
    panels.append(element('panel', 150));
    appWith(element('tab-meta', 62), panels);

    const { result } = renderHook(() => useToastPosition());

    expect(result.current).toBe(158);
  });

  it('ignores the metadata row of a hidden tab, which measures nothing', () => {
    appWith(element('tab-meta', 0));

    const { result } = renderHook(() => useToastPosition());

    expect(result.current).toBe(40);
  });
});
