import React from 'react';
import type { AudioTrack } from '@shared/plugins/audio/shared';

// The queue beneath the player: one row per track, the playing one marked, a click to jump to it and
// a remove control per row. Rows show the file name alone — the size and location of whatever is
// playing belong to the header above, so a queued track costs nothing until it is played.
export function Playlist({
  tracks, current, onSelect, onRemove,
}: {
  tracks: readonly AudioTrack[];
  current: number | null;
  onSelect: (track: AudioTrack) => void;
  onRemove: (track: AudioTrack) => void;
}) {
  return (
    <div className="audio-playlist" role="list">
      {tracks.map((track, index) => (
        <div
          key={track.path}
          role="listitem"
          className={index === current ? 'audio-track audio-track-current' : 'audio-track'}
        >
          <button
            type="button"
            className="audio-track-name"
            aria-current={index === current}
            onClick={() => onSelect(track)}
          >
            {track.name}
          </button>
          <button
            type="button"
            className="audio-track-remove"
            title={`Remove ${track.name}`}
            aria-label={`Remove ${track.name}`}
            onClick={() => onRemove(track)}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
