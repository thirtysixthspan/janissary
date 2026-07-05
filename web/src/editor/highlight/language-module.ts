import type { HLJSApi } from './hljs';

export type LanguageModule = {
  // hljs language id, e.g. 'typescript'.
  language: string;
  // Extensions this module claims, lowercase without the dot.
  extensions: string[];
  register: (hljs: HLJSApi) => void;
};
