import { describe, expect, it, vi } from 'vitest';
import {
  defaultMenuGroups, resolveDefaultMenuTarget, type DefaultMenuTarget,
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
  return { selectionText: '', pasteTarget: null, restoreFocus: null, clicked: null, ...overrides };
}

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
  const actions = { copy: () => {}, paste: () => {}, pasteFromClipboard: () => {} };

  it('offers Copy and Paste in one group when both apply', () => {
    const groups = defaultMenuGroups(
      target({ selectionText: 'hello', pasteTarget: input('text') }), actions,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].map((item) => item.label)).toEqual(['Copy', 'Paste', 'Paste from clipboard…']);
  });

  it('omits Copy when nothing is selected', () => {
    const groups = defaultMenuGroups(target({ pasteTarget: input('text') }), actions);
    expect(groups[0].map((item) => item.label)).toEqual(['Paste', 'Paste from clipboard…']);
  });

  it('omits Paste when there is nowhere to paste', () => {
    const groups = defaultMenuGroups(target({ selectionText: 'hello' }), actions);
    expect(groups[0].map((item) => item.label)).toEqual(['Copy', 'Paste from clipboard…']);
  });

  it('offers Copy for a terminal selection too', () => {
    const groups = defaultMenuGroups(
      target({ selectionText: 'aa bb', selectionSource: 'terminal' }), actions,
    );
    expect(groups[0].map((item) => item.label)).toEqual(['Copy', 'Paste from clipboard…']);
  });

  it('omits Paste for a live terminal copy region even with a resolved paste target', () => {
    const groups = defaultMenuGroups(
      target({ selectionText: 'aa bb', selectionSource: 'terminal', pasteTarget: input('text') }),
      actions,
    );
    expect(groups[0].map((item) => item.label)).toEqual(['Copy', 'Paste from clipboard…']);
  });

  it('still offers Paste for a terminal target with no active copy region', () => {
    const groups = defaultMenuGroups(
      target({ selectionSource: 'terminal', pasteTarget: input('text') }), actions,
    );
    expect(groups[0].map((item) => item.label)).toEqual(['Paste', 'Paste from clipboard…']);
  });

  // The one entry that cannot be withheld is the one that made a right-click on a bare terminal open
  // no menu at all, which is what this family of assertions used to record as the expected outcome.
  it('still offers the clipboard entry where neither other entry applies', () => {
    expect(defaultMenuGroups(target(), actions).map((group) => group.map((item) => item.label)))
      .toEqual([['Paste from clipboard…']]);
  });

  it('activating an entry calls the action with what it acts on', () => {
    const copy = vi.fn();
    const paste = vi.fn();
    const pasteFromClipboard = vi.fn();
    const field = input('text');
    const clicked = div(false);
    const groups = defaultMenuGroups(
      target({ selectionText: 'hello', pasteTarget: field, clicked }), { copy, paste, pasteFromClipboard },
    );
    groups[0][0].onActivate();
    groups[0][1].onActivate();
    groups[0][2].onActivate();
    expect(copy).toHaveBeenCalledWith('hello');
    expect(paste).toHaveBeenCalledWith(field);
    // The right-clicked element, not the paste target: it is the answer to where the user aimed, and
    // on a terminal there is no paste target to take instead.
    expect(pasteFromClipboard).toHaveBeenCalledWith(clicked);
  });
});
