import { describe, expect, it, vi } from 'vitest';
import {
  registerTerminalSelection, terminalSelectionText, unregisterTerminalSelection,
} from './terminal-selection';

function container(): HTMLDivElement {
  const element = document.createElement('div');
  document.body.append(element);
  return element;
}

describe('terminal selection', () => {
  it('resolves the selection of the registered terminal the click landed in', () => {
    const start = container();
    const stop = container();
    registerTerminalSelection(start, {
      hasSelection: () => true,
      getSelection: () => 'cache ls, error 404',
    });

    expect(terminalSelectionText(start)).toBe('cache ls, error 404');
    expect(terminalSelectionText(stop)).toBe('');
  });

  it('resolves empty when the terminal holds no selection', () => {
    const start = container();
    registerTerminalSelection(start, {
      hasSelection: () => false,
      getSelection: () => 'should not be read',
    });

    expect(terminalSelectionText(start)).toBe('');
  });

  it('resolves through a child the click landed on and nothing for clicks outside', () => {
    const start = container();
    const child = document.createElement('canvas');
    start.append(child);
    registerTerminalSelection(start, {
      hasSelection: () => true,
      getSelection: () => 'batch run',
    });

    expect(terminalSelectionText(child)).toBe('batch run');
    expect(terminalSelectionText(document.body)).toBe('');
    expect(terminalSelectionText(null)).toBe('');
  });

  it('stops answering after the terminal unregisters', () => {
    const start = container();
    registerTerminalSelection(start, {
      hasSelection: () => true,
      getSelection: () => 'batch run',
    });

    unregisterTerminalSelection(start);

    expect(terminalSelectionText(start)).toBe('');
  });

  it('passes the click target itself through, closest-container first', () => {
    const outer = container();
    const inner = container();
    outer.append(inner);
    const selection = vi.fn().mockReturnValue('');
    registerTerminalSelection(outer, {
      hasSelection: () => false,
      getSelection: selection,
    });
    registerTerminalSelection(inner, {
      hasSelection: () => true,
      getSelection: () => 'inner selection',
    });

    expect(terminalSelectionText(inner)).toBe('inner selection');
    expect(selection).not.toHaveBeenCalled();
  });
});
