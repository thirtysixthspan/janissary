import { hljs } from './hljs';
import { languageForFile } from './registry';
import { createTokenizer } from './tokenize';

const MAX_LINES = 10_000;
const MAX_CHARS = 1_000_000;

export function syntaxLanguage(text: string, fileName: string): string | null {
  if (text.length > MAX_CHARS || text.split('\n').length > MAX_LINES) return null;
  return languageForFile(fileName, hljs);
}

export function createFileTokenizer() {
  const tokenize = createTokenizer();
  return (text: string, fileName: string) => {
    const language = syntaxLanguage(text, fileName);
    if (!language) return [];
    return tokenize(text, language);
  };
}
