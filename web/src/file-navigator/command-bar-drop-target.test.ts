import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CommandInputDropHandle } from '../shared/drop-handles';
import { registerCommandBarDrop } from '../shared/drop-registry';
import { createCommandBarDropTarget } from './command-bar-drop-target';

function handle(): CommandInputDropHandle {
  return { insertAtCaret: vi.fn(), setDropHighlighted: vi.fn() };
}

const unregister: (() => void)[] = [];

function registeredBar(barHandle: CommandInputDropHandle): Element {
  const element = document.createElement('div');
  unregister.push(registerCommandBarDrop(element, barHandle));
  return element;
}

describe('createCommandBarDropTarget', () => {
  afterEach(() => {
    for (const remove of unregister) remove();
    unregister.length = 0;
  });

  it('inserts into the registered bar under the pointer rather than the fallback', () => {
    const fallback = handle();
    const shellBar = handle();
    const target = createCommandBarDropTarget(() => fallback);

    target.hover(registeredBar(shellBar));
    target.insert('notes.txt');

    expect(shellBar.setDropHighlighted).toHaveBeenCalledWith(true);
    expect(shellBar.insertAtCaret).toHaveBeenCalledWith('notes.txt');
    expect(fallback.insertAtCaret).not.toHaveBeenCalled();
    expect(fallback.setDropHighlighted).not.toHaveBeenCalled();
  });

  it('uses the fallback for a bar that registered nothing', () => {
    const fallback = handle();
    const target = createCommandBarDropTarget(() => fallback);

    target.hover(document.createElement('div'));
    target.insert('notes.txt');

    expect(target.isOver()).toBe(true);
    expect(fallback.setDropHighlighted).toHaveBeenCalledWith(true);
    expect(fallback.insertAtCaret).toHaveBeenCalledWith('notes.txt');
  });

  it('moves the highlight from one bar to the next and clears it when leaving', () => {
    const first = handle();
    const second = handle();
    const target = createCommandBarDropTarget(() => null);

    target.hover(registeredBar(first));
    target.hover(registeredBar(second));
    expect(first.setDropHighlighted).toHaveBeenLastCalledWith(false);
    expect(second.setDropHighlighted).toHaveBeenLastCalledWith(true);

    target.hover(null);
    expect(second.setDropHighlighted).toHaveBeenLastCalledWith(false);
    expect(target.isOver()).toBe(false);
  });

  it('clears the fallback highlight when ended with no bar hovered', () => {
    const fallback = handle();
    const target = createCommandBarDropTarget(() => fallback);

    target.clear();

    expect(fallback.setDropHighlighted).toHaveBeenCalledWith(false);
  });
});
