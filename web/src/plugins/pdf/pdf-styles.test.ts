import { afterEach, expect, it } from 'vitest';
import styles from './pdf.css?raw';

afterEach(() => { document.head.replaceChildren(); document.body.replaceChildren(); });

it('restores scrollbars only on the PDF stage', () => {
  const style = document.createElement('style');
  style.textContent = styles;
  document.head.append(style);
  const stage = document.createElement('div');
  stage.className = 'plugin-stage pdf-stage';
  document.body.append(stage);
  expect(getComputedStyle(stage).scrollbarWidth).toBe('thin');
  const rules = [...(style.sheet?.cssRules ?? [])] as CSSStyleRule[];
  const scrollbar = rules.find((rule) => rule.selectorText === '.pdf-stage::-webkit-scrollbar');
  expect(scrollbar?.style.display).toBe('block');
  expect(rules.some((rule) => rule.selectorText === '.plugin-stage::-webkit-scrollbar')).toBe(false);
});
