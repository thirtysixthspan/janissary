import markdown from 'highlight.js/lib/languages/markdown';
import type { LanguageModule } from '../language-module';

export const markdownLanguage: LanguageModule = {
  language: 'markdown',
  extensions: ['md', 'markdown'],
  register: (hljs) => hljs.registerLanguage('markdown', markdown),
};
