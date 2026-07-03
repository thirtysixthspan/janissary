import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import type { JanusClient } from './ws';
import { fileLineSegments, linkifyMarkdown, renderFileLinkSegments } from './file-link';

describe('fileLineSegments', () => {
  it('returns a plain text segment when no file:line pattern is found', () => {
    const segments = fileLineSegments('just some text');
    expect(segments).toEqual([{ type: 'text', content: 'just some text' }]);
  });

  it('detects a simple file:line pattern', () => {
    const segments = fileLineSegments('Error in src/foo.ts:42');
    expect(segments).toEqual([
      { type: 'text', content: 'Error in ' },
      { type: 'link', fullMatch: 'src/foo.ts:42', path: 'src/foo.ts', line: 42 },
    ]);
  });

  it('detects file:line:col pattern', () => {
    const segments = fileLineSegments('src/app.ts:10:5 needs fixing');
    expect(segments).toEqual([
      { type: 'link', fullMatch: 'src/app.ts:10:5', path: 'src/app.ts', line: 10 },
      { type: 'text', content: ' needs fixing' },
    ]);
  });

  it('detects multiple file:line patterns', () => {
    const segments = fileLineSegments('src/a.ts:1 and src/b.ts:2');
    expect(segments).toEqual([
      { type: 'link', fullMatch: 'src/a.ts:1', path: 'src/a.ts', line: 1 },
      { type: 'text', content: ' and ' },
      { type: 'link', fullMatch: 'src/b.ts:2', path: 'src/b.ts', line: 2 },
    ]);
  });

  it('requires a path separator for detection', () => {
    const segments = fileLineSegments('word:42 is not a file path');
    expect(segments).toEqual([{ type: 'text', content: 'word:42 is not a file path' }]);
  });

  it('detects paths with nested directories', () => {
    const segments = fileLineSegments('lib/components/Button.tsx:123');
    expect(segments).toEqual([
      { type: 'link', fullMatch: 'lib/components/Button.tsx:123', path: 'lib/components/Button.tsx', line: 123 },
    ]);
  });

  it('detects relative paths starting with dot', () => {
    const segments = fileLineSegments('./src/main.ts:7 is the entry');
    expect(segments).toEqual([
      { type: 'link', fullMatch: './src/main.ts:7', path: './src/main.ts', line: 7 },
      { type: 'text', content: ' is the entry' },
    ]);
  });

  it('detects relative paths starting with dot-dot', () => {
    const segments = fileLineSegments('../utils/helper.ts:99');
    expect(segments).toEqual([
      { type: 'link', fullMatch: '../utils/helper.ts:99', path: '../utils/helper.ts', line: 99 },
    ]);
  });

  it('does not match bare :digits without path separator', () => {
    const segments = fileLineSegments(':42 is not a file path either');
    expect(segments).toEqual([{ type: 'text', content: ':42 is not a file path either' }]);
  });

  it('stops at a trailing non-digit word char', () => {
    const segments = fileLineSegments('src/x.ts:10abc is extra');
    expect(segments).toEqual([{ type: 'text', content: 'src/x.ts:10abc is extra' }]);
  });

  it('handles a period after the line number', () => {
    const segments = fileLineSegments('See src/x.ts:10.');
    expect(segments).toEqual([
      { type: 'text', content: 'See ' },
      { type: 'link', fullMatch: 'src/x.ts:10', path: 'src/x.ts', line: 10 },
      { type: 'text', content: '.' },
    ]);
  });

  it('handles line number at end of string', () => {
    const segments = fileLineSegments('path/file.ts:99');
    expect(segments).toEqual([
      { type: 'link', fullMatch: 'path/file.ts:99', path: 'path/file.ts', line: 99 },
    ]);
  });

  it('does not match :digits inside a longer word', () => {
    const segments = fileLineSegments('src/x.ts:42chars');
    expect(segments).toEqual([{ type: 'text', content: 'src/x.ts:42chars' }]);
  });

  it('excludes trailing parentheses from the link', () => {
    const segments = fileLineSegments('(see src/foo.ts:42)');
    expect(segments).toEqual([
      { type: 'text', content: '(see ' },
      { type: 'link', fullMatch: 'src/foo.ts:42', path: 'src/foo.ts', line: 42 },
      { type: 'text', content: ')' },
    ]);
  });
});

describe('linkifyMarkdown', () => {
  it('wraps file:line patterns in markdown link syntax', () => {
    expect(linkifyMarkdown('Error in src/foo.ts:42')).toBe(
      'Error in [src/foo.ts:42](src/foo.ts:42)',
    );
  });

  it('returns unchanged text when no pattern matches', () => {
    expect(linkifyMarkdown('plain text')).toBe('plain text');
  });

  it('handles file:line:col patterns', () => {
    expect(linkifyMarkdown('src/app.ts:10:5 error')).toBe(
      '[src/app.ts:10:5](src/app.ts:10:5) error',
    );
  });
});

describe('renderFileLinkSegments', () => {
  const linkSegment = { type: 'link' as const, fullMatch: 'src/foo.ts:42', path: 'src/foo.ts', line: 42 };

  it('sends an edit command when a file:line link is clicked', async () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    const segments = [{ type: 'text' as const, content: 'Error in ' }, linkSegment];
    render(<>{renderFileLinkSegments(segments, client)}</>);
    await userEvent.click(screen.getByText('src/foo.ts:42'));
    expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'edit src/foo.ts' } });
  });

  it('renders plain text segments without click handlers', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    const segments = [{ type: 'text' as const, content: 'just text' }];
    render(<>{renderFileLinkSegments(segments, client)}</>);
    expect(screen.getByText('just text')).toBeDefined();
  });
});
