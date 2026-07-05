import type { HLJSApi } from './hljs';
import type { LanguageModule } from './language-module';
import { markdownLanguage } from './languages/markdown';
import { javascriptLanguage } from './languages/javascript';
import { typescriptLanguage } from './languages/typescript';
import { jsonLanguage } from './languages/json';

export type { LanguageModule } from './language-module';

// Adding a language later means one new file here plus one entry in this list.
const MODULES: LanguageModule[] = [markdownLanguage, javascriptLanguage, typescriptLanguage, jsonLanguage];

let registered = false;

function ensureRegistered(hljs: HLJSApi): void {
  if (registered) return;
  for (const module_ of MODULES) module_.register(hljs);
  registered = true;
}

// The hljs language id for `name`'s extension, or null when the extension is unknown or missing.
// Case-insensitive; registers every module's grammar on first use.
export function languageForFile(name: string, hljs: HLJSApi): string | null {
  ensureRegistered(hljs);
  const dot = name.lastIndexOf('.');
  if (dot === -1) return null;
  const extension = name.slice(dot + 1).toLowerCase();
  return MODULES.find((module_) => module_.extensions.includes(extension))?.language ?? null;
}
