import javascript from 'highlight.js/lib/languages/javascript';
import type { LanguageModule } from '../language-module';

export const javascriptLanguage: LanguageModule = {
  language: 'javascript',
  extensions: ['js', 'mjs', 'cjs', 'jsx'],
  register: (hljs) => hljs.registerLanguage('javascript', javascript),
};
