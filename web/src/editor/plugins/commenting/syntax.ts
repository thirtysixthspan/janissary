// The extension → comment-syntax table. Entirely the commenting plugin's own business: the
// editor-plugin declaration carries no language field, and the file name reaches the handler on the
// request instead.

export type CommentSyntax =
  | { kind: 'line'; marker: string }
  | { kind: 'block'; open: string; close: string };

const SLASHES: CommentSyntax = { kind: 'line', marker: '//' };
const HASH: CommentSyntax = { kind: 'line', marker: '#' };
const HTML_BLOCK: CommentSyntax = { kind: 'block', open: '<!--', close: '-->' };
const C_BLOCK: CommentSyntax = { kind: 'block', open: '/*', close: '*/' };

// `.json` gets `//` deliberately: the result is JSONC rather than strict JSON, which is what a user
// commenting out a config line wants.
const BY_EXTENSION: Readonly<Record<string, CommentSyntax | undefined>> = {
  js: SLASHES, mjs: SLASHES, cjs: SLASHES, jsx: SLASHES,
  ts: SLASHES, tsx: SLASHES, mts: SLASHES, cts: SLASHES,
  json: SLASHES,
  rb: HASH,
  sh: HASH, bash: HASH, zsh: HASH,
  txt: HASH,
  py: HASH,
  yml: HASH, yaml: HASH,
  md: HTML_BLOCK, markdown: HTML_BLOCK, html: HTML_BLOCK,
  css: C_BLOCK,
};

// The syntax for `name`'s extension, or null when the extension is unknown or absent.
export function syntaxForFile(name: string): CommentSyntax | null {
  const dot = name.lastIndexOf('.');
  if (dot === -1) return null;
  return BY_EXTENSION[name.slice(dot + 1).toLowerCase()] ?? null;
}
