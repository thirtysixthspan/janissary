import json from 'highlight.js/lib/languages/json';
import type { LanguageModule } from '../language-module';

export const jsonLanguage: LanguageModule = {
  language: 'json',
  extensions: ['json'],
  register: (hljs) => hljs.registerLanguage('json', json),
};
