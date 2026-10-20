import { afterEach, describe, expect, it } from 'vitest';
import { enclosingTabLabel } from './tab-label-lookup';

function labelled(label: string): HTMLDivElement {
  const element = document.createElement('div');
  element.dataset.tabLabel = label;
  return element;
}

afterEach(() => { document.body.replaceChildren(); });

describe('enclosingTabLabel', () => {
  it('returns the nearest label when labelled tabs nest', () => {
    const outer = labelled('outer');
    const inner = labelled('inner');
    const leaf = document.createElement('span');
    inner.append(leaf);
    outer.append(inner);
    document.body.append(outer);
    expect(enclosingTabLabel(leaf)).toBe('inner');
  });

  it("returns the element's own label", () => {
    const element = labelled('own');
    document.body.append(element);
    expect(enclosingTabLabel(element)).toBe('own');
  });

  it('returns undefined for null', () => {
    expect(enclosingTabLabel(null)).toBeUndefined();
  });

  it('returns undefined for a target that is not an element', () => {
    expect(enclosingTabLabel(globalThis.window)).toBeUndefined();
    expect(enclosingTabLabel(document.createTextNode('text'))).toBeUndefined();
  });

  it('returns undefined for an element with no labelled ancestor', () => {
    const element = document.createElement('div');
    document.body.append(element);
    expect(enclosingTabLabel(element)).toBeUndefined();
  });
});
