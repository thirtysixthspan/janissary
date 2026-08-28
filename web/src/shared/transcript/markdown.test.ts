import { describe, it, expect, vi } from 'vitest';

vi.mock('marked', () => ({ marked: { parse: vi.fn() } }));

describe('renderMarkdown', () => {
  it('returns undefined when marked.parse throws', async () => {
    const { marked } = await import('marked') as unknown as { marked: { parse: ReturnType<typeof vi.fn> } };
    marked.parse.mockImplementation(() => { throw new Error('boom'); });
    const { renderMarkdown } = await import('./markdown');
    expect(renderMarkdown('# hello')).toBeUndefined();
  });
});
