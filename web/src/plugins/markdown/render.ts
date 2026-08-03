import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Render Markdown text to a sanitized HTML string, returning undefined on parse failure. The
// transcript renders Markdown too, through its own module in core: a client plugin may not import
// host modules, so both call `marked` and `DOMPurify` directly with the same options and the same
// sanitize-before-insert order.
export function renderMarkdown(text: string): string | undefined {
  try {
    return DOMPurify.sanitize(marked.parse(text, { gfm: true, breaks: true, async: false }));
  } catch {
    return undefined;
  }
}
