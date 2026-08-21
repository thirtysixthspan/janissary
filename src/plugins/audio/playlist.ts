import type { AudioPayload, AudioTrack } from './shared.js';

// The playlist state machine, as pure functions over the payload. The server owns the queue; the
// client only ever names an entry that is already in it, so every function here takes the payload it
// is given and returns the next one rather than mutating anything the host still holds.

export function emptyPlaylist(): AudioPayload {
  return { tracks: [], current: null, size: '' };
}

// A newly opened file joins the end of the queue and becomes the playing track. Opening several
// files in turn — what a wildcard does, dispatching each match separately in sorted order — builds
// the queue in that order and leaves the last one playing. A path already queued is not duplicated;
// it simply becomes current, so re-opening a file that is already in the playlist jumps to it.
export function appendTrack(playlist: AudioPayload, track: AudioTrack, size: string): AudioPayload {
  const existing = playlist.tracks.findIndex((entry) => entry.path === track.path);
  if (existing !== -1) return { ...playlist, current: existing, size };
  return {
    ...playlist,
    tracks: [...playlist.tracks, track],
    current: playlist.tracks.length,
    size,
  };
}

export function trackIndex(playlist: AudioPayload, path: string): number {
  return playlist.tracks.findIndex((entry) => entry.path === path);
}

export function selectTrack(playlist: AudioPayload, index: number, size: string): AudioPayload {
  return { ...playlist, current: index, size };
}

// Removing the playing entry advances to the one that follows it, which is the entry that inherits
// its index once the list closes up. Removing the last remaining entry empties the playlist and
// clears the current index; the tab stays open on it. Removing an entry that is not playing never
// disturbs playback — the current index only shifts to keep pointing at the same track.
export function removeTrack(
  playlist: AudioPayload, index: number, sizeOf: (track: AudioTrack) => string,
): AudioPayload {
  const tracks = playlist.tracks.filter((_track, position) => position !== index);
  if (tracks.length === 0) return { ...playlist, tracks, current: null, size: '' };
  const current = playlist.current ?? 0;
  const next = current > index ? current - 1 : Math.min(current, tracks.length - 1);
  return { ...playlist, tracks, current: next, size: sizeOf(tracks[next]) };
}

export function currentTrack(playlist: AudioPayload): AudioTrack | undefined {
  return playlist.current === null ? undefined : playlist.tracks[playlist.current];
}
