export { SYNTAX_THEMES } from '@shared/syntax-themes';
import githubDark from 'highlight.js/styles/github-dark.css?raw';
import github from 'highlight.js/styles/github.css?raw';
import atomOneDark from 'highlight.js/styles/atom-one-dark.css?raw';
import atomOneLight from 'highlight.js/styles/atom-one-light.css?raw';
import monokai from 'highlight.js/styles/monokai.css?raw';
import nord from 'highlight.js/styles/nord.css?raw';
import vs2015 from 'highlight.js/styles/vs2015.css?raw';
import tokyoNightDark from 'highlight.js/styles/tokyo-night-dark.css?raw';

// Keyed in the same order as SYNTAX_THEMES; themes.test.ts asserts the two lists agree.
export const THEME_CSS: Record<string, string> = {
  'github-dark': githubDark,
  github,
  'atom-one-dark': atomOneDark,
  'atom-one-light': atomOneLight,
  monokai,
  nord,
  vs2015,
  'tokyo-night-dark': tokyoNightDark,
};

// Swap the single global `<style>` element's content — one theme active at a time, across every
// open editor tab.
export function applySyntaxTheme(name: string): void {
  const css = THEME_CSS[name];
  if (css === undefined) return;
  let style = document.querySelector<HTMLStyleElement>('#syntax-theme');
  if (!style) {
    style = document.createElement('style');
    style.id = 'syntax-theme';
    document.head.append(style);
  }
  style.textContent = css;
}
