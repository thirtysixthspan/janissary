import { describe, expect, it, vi } from 'vitest';
import {
  defaultMenuGroups, isTextEntryElement, resolveDefaultMenuTarget, type DefaultMenuTarget,
} from './default-menu-target';

function input(type: string): HTMLInputElement {
  const element = document.createElement('input');
  element.type = type;
  return element;
}

// jsdom implements no editing host, so it never derives `isContentEditable` from the attribute and
// leaves the property undefined on every element. Both helpers define it the way a browser would.
function div(contentEditable: boolean): HTMLElement {
  const element = document.createElement('div');
  Object.defineProperty(element, 'isContentEditable', { value: contentEditable });
  return element;
}

function target(overrides: Partial<DefaultMenuTarget> = {}): DefaultMenuTarget {
  return { selectionText: '', pasteTarget: null, restoreFocus: null, ...overrides };
}

describe('isTextEntryElement', () => {
  it('accepts a text input, a textarea, and a contenteditable element', () => {
    expect(isTextEntryElement(input('text'))).toBe(true);
    expect(isTextEntryElement(document.createElement('textarea'))).toBe(true);
    expect(isTextEntryElement(div(true))).toBe(true);
  });

  it('rejects a plain div, a checkbox, and nothing at all', () => {
    expect(isTextEntryElement(div(false))).toBe(false);
    expect(isTextEntryElement(input('checkbox'))).toBe(false);
    expect(isTextEntryElement(null)).toBe(false);
  });
});

describe('resolveDefaultMenuTarget', () => {
  it('takes the field the click landed in as the paste target', () => {
    const field = input('text');
    const resolved = resolveDefaultMenuTarget(field, document.body, 'picked');
    expect(resolved.pasteTarget).toBe(field);
    expect(resolved.selectionText).toBe('picked');
  });

  it('takes the field inside the clicked element when the click landed on a child', () => {
    const wrapper = document.createElement('div');
    const field = input('text');
    wrapper.append(field);
    expect(resolveDefaultMenuTarget(field, null, '').pasteTarget).toBe(field);
  });

  it('falls back to the focused field when the click landed somewhere else', () => {
    const focused = document.createElement('textarea');
    const resolved = resolveDefaultMenuTarget(document.createElement('div'), focused, '');
    expect(resolved.pasteTarget).toBe(focused);
  });

  it('resolves no paste target when neither the click nor the focus is a field', () => {
    const resolved = resolveDefaultMenuTarget(document.createElement('div'), document.body, 'text');
    expect(resolved.pasteTarget).toBeNull();
  });

  it('returns focus to the paste target rather than to whatever held it before', () => {
    const clicked = input('text');
    const focused = document.createElement('textarea');
    expect(resolveDefaultMenuTarget(clicked, focused, '').restoreFocus).toBe(clicked);
  });

  it('returns focus to the previously focused element when there is no paste target', () => {
    const focused = document.createElement('div');
    expect(resolveDefaultMenuTarget(null, focused, 'text').restoreFocus).toBe(focused);
  });
});

describe('defaultMenuGroups', () => {
  const actions = { copy: () => {}, paste: () => {} };

  it('offers Copy and Paste in one group when both apply', () => {
    const groups = defaultMenuGroups(
      target({ selectionText: 'hello', pasteTarget: input('text') }), actions,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].map((item) => item.label)).toEqual(['Copy', 'Paste']);
  });

  it('omits Copy when nothing is selected', () => {
    const groups = defaultMenuGroups(target({ pasteTarget: input('text') }), actions);
    expect(groups[0].map((item) => item.label)).toEqual(['Paste']);
  });

  it('omits Paste when there is nowhere to paste', () => {
    const groups = defaultMenuGroups(target({ selectionText: 'hello' }), actions);
    expect(groups[0].map((item) => item.label)).toEqual(['Copy']);
  });

  it('yields no group at all when neither entry applies', () => {
    expect(defaultMenuGroups(target(), actions)).toEqual([]);
  });

  it('activating an entry calls the action with what it acts on', () => {
    const copy = vi.fn();
    const paste = vi.fn();
    const field = input('text');
    const groups = defaultMenuGroups(
      target({ selectionText: 'hello', pasteTarget: field }), { copy, paste },
    );
    groups[0][0].onActivate();
    groups[0][1].onActivate();
    expect(copy).toHaveBeenCalledWith('hello');
    expect(paste).toHaveBeenCalledWith(field);
  });
});
