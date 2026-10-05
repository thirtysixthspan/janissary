import { marked, type Token, type Tokens } from 'marked';
import { ansi, decodeEntities, visibleWidth } from './ansi-text';

// Application command replies are markdown, which the agent tab's transcript renders as HTML. A
// terminal shows text, so the shell tab renders the same markdown to text styled with ANSI escapes:
// headings and emphasis keep their weight, code its color, lists their markers, and tables line up
// in columns. Lexed with the options the transcript renderer uses, so a single newline is a line
// break here as it is there.
export function markdownToAnsi(markdown: string): string {
  return blocks(marked.lexer(markdown, { gfm: true, breaks: true }), '\n\n');
}

function blocks(tokens: Token[], separator: string): string {
  return tokens.map((token) => block(token)).filter((text): text is string => text !== undefined).join(separator);
}

function block(token: Token): string | undefined {
  switch (token.type) {
    case 'space':
    case 'def':
    case 'checkbox': { return undefined; }
    case 'heading': { return heading(token as Tokens.Heading); }
    case 'paragraph':
    case 'text': { return inlineOrText(token as Tokens.Paragraph | Tokens.Text); }
    case 'code': {
      return (token as Tokens.Code).text.split('\n').map((line) => `    ${ansi.code(line)}`).join('\n');
    }
    case 'blockquote': {
      return blocks((token as Tokens.Blockquote).tokens, '\n\n')
        .split('\n').map((line) => `${ansi.dim('│')} ${line}`).join('\n');
    }
    case 'list': { return list(token as Tokens.List); }
    case 'table': { return table(token as Tokens.Table); }
    case 'hr': { return ansi.dim('─'.repeat(40)); }
    default: { return decodeEntities(token.raw.trimEnd()); }
  }
}

function heading(token: Tokens.Heading): string {
  const text = ansi.bold(inline(token.tokens));
  return token.depth === 1 ? ansi.underline(text) : text;
}

function inlineOrText(token: Tokens.Paragraph | Tokens.Text): string {
  return token.tokens ? inline(token.tokens) : decodeEntities(token.text);
}

function list(token: Tokens.List): string {
  const start = typeof token.start === 'number' ? token.start : 1;
  return token.items.map((item, index) => {
    const marker = token.ordered ? `${start + index}.` : '•';
    const box = item.task ? `[${item.checked ? 'x' : ' '}] ` : '';
    const pad = ' '.repeat(marker.length + 1);
    return blocks(item.tokens, '\n').split('\n')
      .map((line, row) => (row === 0 ? `${marker} ${box}${line}` : `${pad}${line}`))
      .join('\n');
  }).join('\n');
}

function table(token: Tokens.Table): string {
  const cell = (tokens: Token[]) => inline(tokens).replaceAll('\n', ' ');
  const header = token.header.map((entry) => ansi.bold(cell(entry.tokens)));
  const rows = token.rows.map((row) => row.map((entry) => cell(entry.tokens)));
  const widths = header.map((entry, column) => Math.max(
    visibleWidth(entry), ...rows.map((row) => visibleWidth(row[column] ?? '')),
  ));
  const line = (cells: string[]) => cells
    .map((entry, column) => `${entry}${' '.repeat(Math.max(0, widths[column] - visibleWidth(entry)))}`)
    .join('  ')
    .trimEnd();
  return [line(header), ansi.dim(widths.map((width) => '─'.repeat(width)).join('  ')), ...rows.map((row) => line(row))].join('\n');
}

function inline(tokens: Token[] | undefined): string {
  return (tokens ?? []).map((token) => inlineToken(token)).join('');
}

function inlineToken(token: Token): string {
  switch (token.type) {
    case 'strong': { return ansi.bold(inline((token as Tokens.Strong).tokens)); }
    case 'em': { return ansi.italic(inline((token as Tokens.Em).tokens)); }
    case 'del': { return ansi.strike(inline((token as Tokens.Del).tokens)); }
    case 'codespan': { return ansi.code(decodeEntities((token as Tokens.Codespan).text)); }
    case 'br': { return '\n'; }
    case 'link': { return link(token as Tokens.Link); }
    case 'image': { return (token as Tokens.Image).text; }
    case 'text': { return inlineOrText(token as Tokens.Text); }
    case 'escape': { return (token as Tokens.Escape).text; }
    default: { return decodeEntities(token.raw); }
  }
}

// The link text, underlined, with its target after it when the two differ — a terminal cannot
// follow a hidden href, so a target the text does not show would otherwise be lost.
function link(token: Tokens.Link): string {
  const text = inline(token.tokens);
  return token.href === token.text ? ansi.underline(text) : `${ansi.underline(text)} ${ansi.dim(`(${token.href})`)}`;
}
