import { describe, expect, it } from 'vitest';
import { hasHelpMarkdownChanges } from './help-doc-changes.mjs';

describe('hasHelpMarkdownChanges', () => {
  it('matches Markdown files anywhere under help', () => {
    expect(hasHelpMarkdownChanges(['help/commands.md'])).toBe(true);
    expect(hasHelpMarkdownChanges(['help/tab-types/sql.md'])).toBe(true);
  });

  it('ignores Markdown files outside help and non-Markdown files inside help', () => {
    expect(hasHelpMarkdownChanges(['documentation/commands.md'])).toBe(false);
    expect(hasHelpMarkdownChanges(['help/icon.svg'])).toBe(false);
    expect(hasHelpMarkdownChanges([])).toBe(false);
  });
});
