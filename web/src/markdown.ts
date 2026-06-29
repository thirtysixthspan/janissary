import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Render Markdown text to a sanitized HTML string. Returns undefined on parse failure.
export function renderMarkdown(text: string): string | undefined {
  try {
    return DOMPurify.sanitize(marked.parse(text, { gfm: true, breaks: true, async: false }));
  } catch {
    return undefined;
  }
}
