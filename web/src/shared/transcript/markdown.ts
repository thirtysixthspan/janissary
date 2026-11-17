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

// Render Markdown text to a sanitized HTML string. Returns undefined on parse failure.
export function renderMarkdown(text: string): string | undefined {
  try {
    return DOMPurify.sanitize(marked.parse(literalUsage(text), { gfm: true, breaks: true, async: false }));
  } catch {
    return undefined;
  }
}
