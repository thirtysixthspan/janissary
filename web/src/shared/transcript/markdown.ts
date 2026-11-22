import { marked } from 'marked';
import DOMPurify from 'dompurify';

// A single-line `Usage:` reply is command text, not Markdown: its angle-bracket placeholders name
// arguments and must print literally rather than being read as raw HTML and dropped by the sanitizer.
function literalUsage(text: string): string {
  const match = /^(\s*)([^\n]*Usage: [^\n]*)(\s*)$/.exec(text);
  if (!match) return text;
  const [, leading, body, trailing] = match;
  const usageAt = body.indexOf('Usage: ');
  const prefix = body.slice(0, usageAt);
  const usage = body.slice(usageAt).replaceAll(/(?<!\\)[<>]/g, (bracket) => `\\${bracket}`);
  return `${leading}${prefix}${usage}${trailing}`;
}

// A persona load error names the missing directive placeholder as `<role>` (related errors name
// `<persona>` and `<role>` too). Like a usage reply it is a single line of plain text: a bare
// `<role>` reaches marked as an unknown element the sanitizer drops with its text. Escape only
// persona error lines so the literal placeholder prints, leaving other markdown and raw HTML alone.
function literalPersonaError(text: string): string {
  if (!/^\s*Persona\s+"/.test(text)) return text;
  return text.replaceAll(/(?<!\\)[<>]/g, (bracket) => `\\${bracket}`);
}

// Render Markdown text to a sanitized HTML string. Returns undefined on parse failure.
export function renderMarkdown(text: string): string | undefined {
  try {
    const literal = literalPersonaError(literalUsage(text));
    return DOMPurify.sanitize(marked.parse(literal, { gfm: true, breaks: true, async: false }));
  } catch {
    return undefined;
  }
}
