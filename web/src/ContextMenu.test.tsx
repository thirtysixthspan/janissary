import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ContextMenu, contextMenuPosition, type ContextMenuItem } from './ContextMenu';

function makeGroups(onActivate: () => void = () => {}): ContextMenuItem[][] {
  return [
    [{ label: 'Open', onActivate }, { label: 'Open with', onActivate }],
    [{ label: 'Delete', onActivate }],
  ];
}

function menu(): HTMLElement {
  return screen.getByRole('menu');
}

describe('ContextMenu', () => {
  it('renders every item with a separator between groups', () => {
    const { container } = render(<ContextMenu groups={makeGroups()} x={10} y={10} onClose={() => {}} />);
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent))
      .toEqual(['Open', 'Open with', 'Delete']);
    expect(container.querySelectorAll('.context-menu-separator')).toHaveLength(1);
  });

  it('highlights the first item and moves the highlight with the arrow keys', () => {
    render(<ContextMenu groups={makeGroups()} x={10} y={10} onClose={() => {}} />);
    expect(screen.getByText('Open').className).toContain('selected');
    fireEvent.keyDown(menu(), { key: 'ArrowDown' });
    expect(screen.getByText('Open with').className).toContain('selected');
    fireEvent.keyDown(menu(), { key: 'ArrowUp' });
    expect(screen.getByText('Open').className).toContain('selected');
  });

  it('clamps the highlight at both ends', () => {
    render(<ContextMenu groups={makeGroups()} x={10} y={10} onClose={() => {}} />);
    fireEvent.keyDown(menu(), { key: 'ArrowUp' });
    expect(screen.getByText('Open').className).toContain('selected');
    for (let i = 0; i < 5; i++) fireEvent.keyDown(menu(), { key: 'ArrowDown' });
    expect(screen.getByText('Delete').className).toContain('selected');
  });

  it('activates the highlighted item on Enter and closes', () => {
    const onActivate = vi.fn();
    const onClose = vi.fn();
    render(<ContextMenu groups={makeGroups(onActivate)} x={10} y={10} onClose={onClose} />);
    fireEvent.keyDown(menu(), { key: 'ArrowDown' });
    fireEvent.keyDown(menu(), { key: 'Enter' });
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('activates an item on click and closes', () => {
    const onActivate = vi.fn();
    const onClose = vi.fn();
    render(<ContextMenu groups={makeGroups(onActivate)} x={10} y={10} onClose={onClose} />);
    fireEvent.click(screen.getByText('Delete'));
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape and on losing focus', () => {
    const onClose = vi.fn();
    const { unmount } = render(<ContextMenu groups={makeGroups()} x={10} y={10} onClose={onClose} />);
    fireEvent.keyDown(menu(), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.blur(menu());
    expect(onClose).toHaveBeenCalledTimes(2);
    unmount();
  });

  it('takes keyboard focus when it opens', () => {
    render(<ContextMenu groups={makeGroups()} x={10} y={10} onClose={() => {}} />);
    expect(document.activeElement).toBe(menu());
  });

  it('shifts back inside the window rather than overflowing an edge', () => {
    const groups = makeGroups();
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const x = viewport.width - 2;
    const y = viewport.height - 2;
    const placed = contextMenuPosition(x, y, groups, viewport);
    expect(placed.left).toBeLessThan(x);
    expect(placed.top).toBeLessThan(y);
    render(<ContextMenu groups={groups} x={x} y={y} onClose={() => {}} />);
    expect(menu().style.left).toBe(`${placed.left}px`);
    expect(menu().style.top).toBe(`${placed.top}px`);
  });

  it('places the menu at the pointer when there is room', () => {
    render(<ContextMenu groups={makeGroups()} x={40} y={60} onClose={() => {}} />);
    expect(menu().style.left).toBe('40px');
    expect(menu().style.top).toBe('60px');
  });
});
