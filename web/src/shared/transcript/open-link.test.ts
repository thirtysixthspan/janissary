import { describe, expect, it, vi } from 'vitest';
import { openTranscriptLink } from './open-link';

function intents() {
  return { onOpenFile: vi.fn(), onEditFile: vi.fn() };
}

describe('openTranscriptLink', () => {
  it('opens a web address', () => {
    const handlers = intents();
    expect(openTranscriptLink('https://example.com/docs', handlers)).toBe(true);
    expect(handlers.onOpenFile).toHaveBeenCalledWith('https://example.com/docs');
    expect(handlers.onEditFile).not.toHaveBeenCalled();
  });

  it('edits a file and line reference', () => {
    const handlers = intents();
    expect(openTranscriptLink('src/foo.ts:42', handlers)).toBe(true);
    expect(handlers.onEditFile).toHaveBeenCalledWith('src/foo.ts:42');
    expect(handlers.onOpenFile).not.toHaveBeenCalled();
  });

  it('opens a web address that ends in a line number rather than editing it', () => {
    const handlers = intents();
    expect(openTranscriptLink('https://example.com/src/a.ts:12', handlers)).toBe(true);
    expect(handlers.onOpenFile).toHaveBeenCalledWith('https://example.com/src/a.ts:12');
    expect(handlers.onEditFile).not.toHaveBeenCalled();
  });

  it('leaves any other link alone', () => {
    const handlers = intents();
    expect(openTranscriptLink('#section', handlers)).toBe(false);
    expect(openTranscriptLink('mailto:someone@example.com', handlers)).toBe(false);
    expect(handlers.onOpenFile).not.toHaveBeenCalled();
    expect(handlers.onEditFile).not.toHaveBeenCalled();
  });
});
