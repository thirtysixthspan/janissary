import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HarnessTranscriptTailer } from './tailer.js';
import { ensureHarnessTranscriptDirectory, harnessTranscriptPath } from '../transcript-file.js';
import { createWriteStream } from 'node:fs';
import type { TranscriptSource } from './source.js';

vi.mock('../transcript-file.js', () => ({
  ensureHarnessTranscriptDirectory: vi.fn(),
  harnessTranscriptPath: vi.fn(() => '/project/.janissary/harness-transcripts/claude-now.txt'),
}));

const streamMock = vi.hoisted(() => ({ writes: [] as string[], ended: 0 }));
vi.mock('node:fs', () => ({
  createWriteStream: vi.fn(() => ({
    on: vi.fn(),
    write: vi.fn((chunk: string) => { streamMock.writes.push(chunk); }),
    end: vi.fn(() => { streamMock.ended += 1; }),
  })),
}));

// A source under the test's control: `queue` is drained one poll at a time, and `resolves` decides
// whether the tailer ever considers the session found.
function fakeSource(queue: string[][], resolves = true): TranscriptSource {
  return {
    poll: () => queue.shift() ?? [],
    resolved: () => resolves && queue.length === 0,
  };
}

const POLL_MS = 2000;
const DEADLINE_MS = 120_000;

beforeEach(() => {
  vi.useFakeTimers();
  streamMock.writes.length = 0;
  streamMock.ended = 0;
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('HarnessTranscriptTailer', () => {
  it('creates no file and holds no entries before the first record', () => {
    const tailer = new HarnessTranscriptTailer('claude', fakeSource([[]]), vi.fn());
    vi.advanceTimersByTime(POLL_MS * 3);
    expect(tailer.entriesAfter(0)).toEqual([]);
    expect(tailer.transcriptFile()).toBeUndefined();
    expect(createWriteStream).not.toHaveBeenCalled();
    expect(ensureHarnessTranscriptDirectory).not.toHaveBeenCalled();
    tailer.dispose();
  });

  it('accumulates entries and appends them to one lazily opened stream', () => {
    const tailer = new HarnessTranscriptTailer('claude', fakeSource([['user: hello'], ['assistant: hi']]), vi.fn());
    vi.advanceTimersByTime(POLL_MS);
    expect(tailer.entriesAfter(0)).toEqual(['user: hello']);
    expect(tailer.transcriptFile()).toBe('/project/.janissary/harness-transcripts/claude-now.txt');
    vi.advanceTimersByTime(POLL_MS);
    expect(tailer.entriesAfter(0)).toEqual(['user: hello', 'assistant: hi']);
    expect(createWriteStream).toHaveBeenCalledTimes(1);
    expect(streamMock.writes).toEqual(['user: hello\n\n', 'assistant: hi\n\n']);
    expect(harnessTranscriptPath).toHaveBeenCalledWith('claude', expect.any(Number));
    tailer.dispose();
  });

  it('serves entries after a caller\'s own index', () => {
    const tailer = new HarnessTranscriptTailer('claude', fakeSource([['one', 'two'], ['three']]), vi.fn());
    vi.advanceTimersByTime(POLL_MS * 2);
    expect(tailer.entriesAfter(2)).toEqual(['three']);
    expect(tailer.entriesAfter(3)).toEqual([]);
    tailer.dispose();
  });

  it('notifies exactly once at the resolve deadline and stops polling', () => {
    const onUnavailable = vi.fn();
    const poll = vi.fn(() => []);
    const tailer = new HarnessTranscriptTailer('claude', { poll, resolved: () => false }, onUnavailable);
    vi.advanceTimersByTime(DEADLINE_MS);
    expect(onUnavailable).toHaveBeenCalledTimes(1);
    const pollsAtDeadline = poll.mock.calls.length;
    vi.advanceTimersByTime(DEADLINE_MS);
    expect(onUnavailable).toHaveBeenCalledTimes(1);
    expect(poll).toHaveBeenCalledTimes(pollsAtDeadline);
    tailer.dispose();
  });

  it('never notifies while the source has resolved', () => {
    const onUnavailable = vi.fn();
    const tailer = new HarnessTranscriptTailer('claude', fakeSource([['user: hello']]), onUnavailable);
    vi.advanceTimersByTime(DEADLINE_MS * 2);
    expect(onUnavailable).not.toHaveBeenCalled();
    tailer.dispose();
  });

  it('stops polling and closes the stream on dispose', () => {
    const poll = vi.fn(() => ['user: hello']);
    const tailer = new HarnessTranscriptTailer('claude', { poll, resolved: () => true }, vi.fn());
    vi.advanceTimersByTime(POLL_MS);
    tailer.dispose();
    const pollsAtDispose = poll.mock.calls.length;
    vi.advanceTimersByTime(POLL_MS * 5);
    expect(poll).toHaveBeenCalledTimes(pollsAtDispose);
    expect(streamMock.ended).toBe(1);
  });

  it('disables itself when the source throws instead of escalating', () => {
    const poll = vi.fn(() => { throw new Error('unreadable'); });
    const tailer = new HarnessTranscriptTailer('claude', { poll, resolved: () => false }, vi.fn());
    expect(() => { vi.advanceTimersByTime(POLL_MS * 4); }).not.toThrow();
    expect(poll).toHaveBeenCalledTimes(1);
    tailer.dispose();
  });
});
