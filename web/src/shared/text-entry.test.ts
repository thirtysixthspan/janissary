import { describe, expect, it } from 'vitest';
import { isTextEntryElement } from './text-entry';

function input(type: string): HTMLInputElement {
  const element = document.createElement('input');
  element.type = type;
  return element;
}

// jsdom implements no editing host, so it never derives `isContentEditable` from the attribute and
// leaves the property undefined on every element. This defines it the way a browser would.
function div(contentEditable: boolean): HTMLElement {
  const element = document.createElement('div');
  Object.defineProperty(element, 'isContentEditable', { value: contentEditable });
  return element;
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
