import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { EditorRevealButton } from './EditorRevealButton';

describe('EditorRevealButton', () => {
  it('rests with the plain title and forwards its click', () => {
    const onReveal = vi.fn();
    const { container } = render(<EditorRevealButton revealBlocked={undefined} onReveal={onReveal} />);
    const button = container.querySelector('button')!;
    expect(button.className).toBe('editor-reveal-button');
    expect(button.getAttribute('title')).toBe('Reveal in file navigator');
    expect(button.getAttribute('aria-label')).toBe('Reveal in file navigator');
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(onReveal).toHaveBeenCalledOnce();
  });

  it('names the unsaved reason in both attributes and is disabled', () => {
    const { container } = render(<EditorRevealButton revealBlocked="unsaved" onReveal={vi.fn()} />);
    const button = container.querySelector('button')!;
    expect(button.getAttribute('title')).toBe('Reveal in file navigator (save the file first)');
    expect(button.getAttribute('aria-label')).toBe('Reveal in file navigator (save the file first)');
    expect(button).toBeDisabled();
  });

  it('names the orphaned remote reason in both attributes and is disabled', () => {
    const { container } = render(<EditorRevealButton revealBlocked="no-route" onReveal={vi.fn()} />);
    const button = container.querySelector('button')!;
    expect(button.getAttribute('title')).toBe('Reveal in file navigator (reopen from a remote navigator)');
    expect(button.getAttribute('aria-label')).toBe('Reveal in file navigator (reopen from a remote navigator)');
    expect(button).toBeDisabled();
  });

  it('renders the folder icon', () => {
    const { container } = render(<EditorRevealButton revealBlocked={undefined} onReveal={vi.fn()} />);
    expect(container.querySelector(':scope button svg[data-icon="folder"]')).not.toBeNull();
  });

  it('stops its mouse-up before the metadata row sees it', () => {
    const onMouseUp = vi.fn();
    const { container } = render(
      <div onMouseUp={onMouseUp}>
        <EditorRevealButton revealBlocked={undefined} onReveal={vi.fn()} />
      </div>,
    );
    fireEvent.mouseUp(container.querySelector('button')!);
    expect(onMouseUp).not.toHaveBeenCalled();
  });

  it('calls nothing for a click while disabled', () => {
    const onReveal = vi.fn();
    const { container } = render(<EditorRevealButton revealBlocked="unsaved" onReveal={onReveal} />);
    fireEvent.click(container.querySelector('button')!);
    expect(onReveal).not.toHaveBeenCalled();
  });
});
