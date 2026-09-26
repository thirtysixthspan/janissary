import { describe, it, expect } from 'vitest';
import { createRemoteTranscriptSource } from './transcript-source.js';

describe('createRemoteTranscriptSource', () => {
  it('has drained nothing and resolved nothing before the remote pushes anything', () => {
    const source = createRemoteTranscriptSource();
    expect(source.poll()).toEqual([]);
    expect(source.resolved()).toBe(false);
  });

  it('hands the pushed blocks to the next poll', () => {
    const source = createRemoteTranscriptSource();
    source.push(['a', 'b']);
    expect(source.poll()).toEqual(['a', 'b']);
  });

  // A poll that arrives before the remote has resolved its session record: the tailer uses an empty
  // poll to mean "nothing new yet", and must not be handed a spurious empty batch that reads as one.
  it('ignores an empty push, so it neither queues a batch nor counts as resolved', () => {
    const source = createRemoteTranscriptSource();
    source.push([]);
    expect(source.poll()).toEqual([]);
    expect(source.resolved()).toBe(false);
  });

  it('queues the next batch independently of the one already drained', () => {
    const source = createRemoteTranscriptSource();
    source.push(['a']);
    expect(source.poll()).toEqual(['a']);
    source.push(['b', 'c']);
    expect(source.poll()).toEqual(['b', 'c']);
  });

  // Draining is destructive: a poll reports only what appeared since the last one, so an unchanged
  // tail is never re-rendered to the transcript.
  it('drains each batch exactly once', () => {
    const source = createRemoteTranscriptSource();
    source.push(['a']);
    expect(source.poll()).toEqual(['a']);
    expect(source.poll()).toEqual([]);
  });

  it('resolves as soon as any block has been pushed', () => {
    const source = createRemoteTranscriptSource();
    expect(source.resolved()).toBe(false);
    source.push(['a']);
    expect(source.resolved()).toBe(true);
  });
});
