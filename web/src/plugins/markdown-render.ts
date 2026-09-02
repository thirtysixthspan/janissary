import { marked } from 'marked';
import DOMPurify from 'dompurify';

export function renderMarkdown(text: string): string | undefined {
  try {
    return DOMPurify.sanitize(marked.parse(text, { gfm: true, breaks: true, async: false }));
  } catch {
    return undefined;
  }
}
