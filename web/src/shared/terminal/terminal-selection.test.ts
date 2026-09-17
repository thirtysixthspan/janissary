import { describe, expect, it, vi } from 'vitest';
import {
  clearTerminalSelection, registerTerminalSelection, terminalSelectionText, unregisterTerminalSelection,
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
      clear: () => {},
    });

    expect(terminalSelectionText(start)).toBe('cache ls, error 404');
    expect(terminalSelectionText(stop)).toBe('');
  });

  it('resolves empty when the terminal holds no selection', () => {
    const start = container();
    registerTerminalSelection(start, {
      hasSelection: () => false,
      getSelection: () => 'should not be read',
      clear: () => {},
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
      clear: () => {},
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
      clear: () => {},
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
      clear: () => {},
    });
    registerTerminalSelection(inner, {
      hasSelection: () => true,
      getSelection: () => 'inner selection',
      clear: () => {},
    });

    expect(terminalSelectionText(inner)).toBe('inner selection');
    expect(selection).not.toHaveBeenCalled();
  });

  it('answers with the Shift+drag layer first and falls back to the emulator selection', () => {
    const start = container();
    let layerHeld = true;
    let termHeld = false;
    const term = { hasSelection: () => termHeld, getSelection: () => 'emulator selection' };
    const layer = { holds: () => layerHeld, text: () => 'layer selection' };
    registerTerminalSelection(start, {
      hasSelection: () => layer.holds() || term.hasSelection(),
      getSelection: () => (layer.holds() ? layer.text() : term.getSelection()),
      clear: () => {},
    });

    expect(terminalSelectionText(start)).toBe('layer selection');
    layerHeld = false;
    termHeld = true;
    expect(terminalSelectionText(start)).toBe('emulator selection');
    termHeld = false;
    expect(terminalSelectionText(start)).toBe('');
  });

  it('clears the registered terminal the target falls inside', () => {
    const start = container();
    const clear = vi.fn();
    registerTerminalSelection(start, { hasSelection: () => true, getSelection: () => 'held', clear });

    clearTerminalSelection(start);

    expect(clear).toHaveBeenCalledOnce();
  });

  it('does nothing for a target outside every registration', () => {
    const start = container();
    const outside = container();
    const clear = vi.fn();
    registerTerminalSelection(start, { hasSelection: () => true, getSelection: () => 'held', clear });

    clearTerminalSelection(outside);
    clearTerminalSelection(null);

    expect(clear).not.toHaveBeenCalled();
  });
});
