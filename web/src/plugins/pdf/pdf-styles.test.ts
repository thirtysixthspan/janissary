import { afterEach, describe, expect, it } from 'vitest';
import entry from './index?raw';
import styles from './pdf.css?raw';
import textLayerStyles from './pdf-text-layer.css?raw';

// The stylesheets a PDF tab loads, minus `../shared.css`, which is the plugin-wide frame every view
// tab draws and is not this plugin's to contain.
const sheets = [
  ['pdf.css', styles],
  ['pdf-text-layer.css', textLayerStyles],
] as const;

afterEach(() => { document.head.replaceChildren(); document.body.replaceChildren(); });

function load(css: string): CSSStyleSheet {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);
  return style.sheet as CSSStyleSheet;
}

function selectorsOf(css: string): string[] {
  const rules = [...load(css).cssRules] as CSSStyleRule[];
  expect(rules.length).toBeGreaterThan(0);
  return rules.flatMap((rule) => rule.selectorText.split(',')).map((part) => part.trim());
}

it('restores scrollbars only on the PDF stage', () => {
  const sheet = load(styles);
  const stage = document.createElement('div');
  stage.className = 'plugin-stage pdf-stage';
  document.body.append(stage);
  expect(getComputedStyle(stage).scrollbarWidth).toBe('thin');
  const rules = [...sheet.cssRules] as CSSStyleRule[];
  const scrollbar = rules.find((rule) => rule.selectorText === '.pdf-stage::-webkit-scrollbar');
  expect(scrollbar?.style.display).toBe('block');
  expect(rules.some((rule) => rule.selectorText === '.plugin-stage::-webkit-scrollbar')).toBe(false);
});

describe('the PDF plugin stays inside its own tab', () => {
  it.each(sheets)('roots every selector in %s at a pdf- class', (_name, css) => {
    for (const selector of selectorsOf(css)) expect(selector).toMatch(/^\.pdf-/);
  });

  // The symptom as reported: opening a PDF gave the file navigator and the notifications feed in a
  // sidebar a white background, because the viewer stylesheet `pdfjs-dist` ships styles a `.sidebar`
  // of its own. Stated as a match rather than a computed style: the leaking rules use nesting and
  // `light-dark()`, neither of which jsdom parses, so a computed background would look innocent here
  // whether or not the leak was present.
  it('matches nothing the host draws', () => {
    const host = ['sidebar sidebar-left', 'sidebar-body', 'tabstrip', 'transcript', 'files-rows',
      'notifications-tab', 'plugin-tab'].map((className) => {
      const element = document.createElement('div');
      element.className = className;
      element.dataset.mainRotation = '90';
      document.body.append(element);
      return element;
    });
    const elements = [document.documentElement, document.body, ...host];

    for (const [, css] of sheets) {
      for (const selector of selectorsOf(css)) {
        const matchable = selector.replace(/::[\w-]+$/, '');
        for (const element of elements) expect(element.matches(matchable)).toBe(false);
      }
    }
  });

  it('loads no stylesheet from the renderer package', () => {
    expect(entry).not.toMatch(/pdfjs-dist[^'"]*\.css/);
  });
});
