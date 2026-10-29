import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'lightningcss';
import { describe, expect, it } from 'vitest';

const WEB_SRC = path.dirname(fileURLToPath(import.meta.url));
const SHELL_CSS = path.join('plugins', 'shell', 'shell.css');

function stylesheets(): string[] {
  return readdirSync(WEB_SRC, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.css'))
    .toSorted((a, b) => a.localeCompare(b));
}

function minify(file: string) {
  return transform({ filename: file, code: readFileSync(path.join(WEB_SRC, file)), minify: true });
}

describe('web stylesheets', () => {
  it('finds the stylesheets the build bundles', () => {
    expect(stylesheets()).toContain(SHELL_CSS);
  });

  it.each(stylesheets())('%s minifies without warnings', (file) => {
    expect(minify(file).warnings.map((warning) => warning.message)).toEqual([]);
  });

  it('keeps the shell reply-selection highlight through minification', () => {
    expect(minify(SHELL_CSS).code.toString()).toContain('::highlight(shell-reply-selection)');
  });
});
