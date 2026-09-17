import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SelectionOverlay } from './SelectionOverlay';
import { selectionCellIndices, type SelectionLayer } from './terminal-selection-layer';
import type { FrozenScreen } from './terminal-screen-clone';

const metrics = { cellWidth: 10, cellHeight: 20, offsetLeft: 4, offsetTop: 6 };

const state: SelectionLayer = {
  snapshot: ['alpha beta'],
  cells: [selectionCellIndices('alpha beta')],
  anchor: { col: 6, row: 0 },
  head: { col: 10, row: 0 },
};

function clonedScreen(): FrozenScreen {
  const node = document.createElement('div');
  node.className = 'xterm-screen';
  node.innerHTML = '<div class="xterm-rows"><div><span class="xterm-fg-2">alpha beta</span></div></div>';
  return { node, ownerClass: 'xterm xterm-dom-renderer-owner-3', metrics };
}

describe('SelectionOverlay', () => {
  it('mounts the cloned screen under the terminal root class list', () => {
    const screen = clonedScreen();
    const { container } = render(<SelectionOverlay state={state} screen={screen} />);
    const host = container.querySelector<HTMLElement>('.xterm-dom-renderer-owner-3')!;
    expect(host.contains(screen.node)).toBe(true);
    expect(host.querySelector('.xterm-fg-2')?.textContent).toBe('alpha beta');
    expect(host.style.left).toBe('4px');
    expect(host.style.top).toBe('6px');
  });

  it('paints the pick as a rectangle on the clone’s grid rather than re-drawing the text', () => {
    const { container } = render(<SelectionOverlay state={state} screen={clonedScreen()} />);
    const rect = container.querySelector<HTMLElement>('.terminal-selection-highlight')!;
    expect(rect.style.left).toBe('64px');
    expect(rect.style.top).toBe('6px');
    expect(rect.style.width).toBe('40px');
    expect(rect.style.height).toBe('20px');
    expect(container.querySelector('.terminal-selection-row')).toBeNull();
  });

  it('falls back to the snapshot text when there is no rendered screen to clone', () => {
    const { container } = render(
      <SelectionOverlay state={state} screen={{ node: null, ownerClass: '', metrics }} />,
    );
    expect(container.querySelector('.editor-sel')?.textContent).toBe('beta');
    expect(container.querySelector('.terminal-selection-row')?.textContent).toBe('alpha beta');
    expect(container.querySelector('.terminal-selection-highlight')).toBeNull();
  });

  it('draws nothing at all while no selection is held', () => {
    const { container } = render(<SelectionOverlay state={null} screen={null} />);
    expect(container.querySelector('.terminal-selection-overlay')).toBeNull();
  });
});
