import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ parse: vi.fn() }));
vi.mock('marked', () => ({ marked: { parse: mocks.parse } }));

import { renderMarkdown } from './markdown-render';

beforeEach(() => { mocks.parse.mockReset(); });

describe('renderMarkdown', () => {
  it('sanitizes parsed Markdown', () => {
    mocks.parse.mockReturnValue('<p>safe</p><script>bad()</script>');
    expect(renderMarkdown('text')).toBe('<p>safe</p>');
  });

  it('returns undefined when parsing fails', () => {
    mocks.parse.mockImplementation(() => { throw new Error('parse failed'); });
    expect(renderMarkdown('text')).toBeUndefined();
  });
});
