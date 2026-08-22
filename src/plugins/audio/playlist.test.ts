import { describe, expect, it } from 'vitest';
import {
  appendTrack, currentTrack, emptyPlaylist, removeTrack, selectTrack, trackIndex,
} from './playlist.js';
import type { AudioPayload, AudioTrack } from './shared.js';

function track(name: string): AudioTrack {
  return { name, path: `/music/${name}`, url: `/open/${name}` };
}

function queued(...names: string[]): AudioPayload {
  let playlist = emptyPlaylist();
  for (const name of names) playlist = appendTrack(playlist, track(name), '1.0 MB');
  return playlist;
}

describe('audio playlist — appending', () => {
  it('makes the first track of an empty playlist the current one', () => {
    const playlist = appendTrack(emptyPlaylist(), track('a.mp3'), '2.0 MB');
    expect(playlist.tracks.map((entry) => entry.name)).toEqual(['a.mp3']);
    expect(playlist.current).toBe(0);
    expect(playlist.size).toBe('2.0 MB');
  });

  it('adds to the end of a populated playlist and jumps to what was added', () => {
    const playlist = appendTrack(queued('a.mp3', 'b.mp3'), track('c.mp3'), '3.0 MB');
    expect(playlist.tracks.map((entry) => entry.name)).toEqual(['a.mp3', 'b.mp3', 'c.mp3']);
    expect(playlist.current).toBe(2);
    expect(currentTrack(playlist)?.name).toBe('c.mp3');
  });

  it('jumps to a track already queued instead of queueing it twice', () => {
    const playlist = appendTrack(queued('a.mp3', 'b.mp3'), track('a.mp3'), '2.0 MB');
    expect(playlist.tracks).toHaveLength(2);
    expect(playlist.current).toBe(0);
  });
});

describe('audio playlist — removing', () => {
  const sizeOf = () => '1.0 MB';

  it('advances to the following track when the playing one is removed', () => {
    const playlist = removeTrack(selectTrack(queued('a.mp3', 'b.mp3', 'c.mp3'), 0, '1.0 MB'), 0, sizeOf);
    expect(playlist.tracks.map((entry) => entry.name)).toEqual(['b.mp3', 'c.mp3']);
    expect(currentTrack(playlist)?.name).toBe('b.mp3');
  });

  it('empties the playlist and clears the current index on the last remaining entry', () => {
    const playlist = removeTrack(queued('a.mp3'), 0, sizeOf);
    expect(playlist.tracks).toEqual([]);
    expect(playlist.current).toBeNull();
    expect(playlist.size).toBe('');
    expect(currentTrack(playlist)).toBeUndefined();
  });

  it('leaves the playing track and its index correct when another entry goes', () => {
    const playing = selectTrack(queued('a.mp3', 'b.mp3', 'c.mp3'), 2, '1.0 MB');
    const playlist = removeTrack(playing, 0, sizeOf);
    expect(playlist.current).toBe(1);
    expect(currentTrack(playlist)?.name).toBe('c.mp3');
  });

  it('clamps rather than wrapping when the last entry in the queue is the one removed', () => {
    const playing = selectTrack(queued('a.mp3', 'b.mp3'), 1, '1.0 MB');
    const playlist = removeTrack(playing, 1, sizeOf);
    expect(playlist.current).toBe(0);
    expect(currentTrack(playlist)?.name).toBe('a.mp3');
  });
});

describe('audio playlist — lookup and selection', () => {
  it('finds a queued track by path and reports -1 for one it does not hold', () => {
    const playlist = queued('a.mp3', 'b.mp3');
    expect(trackIndex(playlist, '/music/b.mp3')).toBe(1);
    expect(trackIndex(playlist, '/music/z.mp3')).toBe(-1);
  });

  it('moves the current index without disturbing the queue', () => {
    const playlist = selectTrack(queued('a.mp3', 'b.mp3'), 0, '9.0 MB');
    expect(playlist.tracks).toHaveLength(2);
    expect(playlist.current).toBe(0);
    expect(playlist.size).toBe('9.0 MB');
  });
});
