import typescript from 'highlight.js/lib/languages/typescript';
import type { LanguageModule } from '../language-module';

export const typescriptLanguage: LanguageModule = {
  language: 'typescript',
  extensions: ['ts', 'tsx', 'mts', 'cts'],
  register: (hljs) => hljs.registerLanguage('typescript', typescript),
};
