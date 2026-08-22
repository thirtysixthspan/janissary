export const AUDIO_PAYLOAD_SCHEMA_VERSION = 1;

// The instance key every audio tab opens under. Constant because there is only ever one player: a
// second `open` appends to the playlist this key already addresses rather than opening a second tab.
export const AUDIO_TAB_KEY = 'player';

export type AudioTrack = {
  name: string;
  path: string;
  url: string;
};

// The server's record of the queue. `current` indexes `tracks`, or is `null` when the playlist is
// empty — the tab stays open on an empty queue rather than closing itself. `size` is the current
// track's alone, so a queued track costs no stat until it is played. Transport state — position,
// paused, volume — belongs to the client and never round-trips.
export type AudioPayload = {
  tracks: AudioTrack[];
  current: number | null;
  size: string;
};

export type SelectTrackPayload = { path: string };
export type RemoveTrackPayload = { path: string; unplayable?: boolean };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isAudioTrack(value: unknown): value is AudioTrack {
  return isRecord(value)
    && typeof value.name === 'string'
    && typeof value.path === 'string'
    && typeof value.url === 'string';
}

export function isAudioPayload(value: unknown): value is AudioPayload {
  return isRecord(value)
    && Array.isArray(value.tracks)
    && value.tracks.every((element) => isAudioTrack(element))
    && (value.current === null || typeof value.current === 'number')
    && typeof value.size === 'string';
}

export function isSelectTrackPayload(value: unknown): value is SelectTrackPayload {
  return isRecord(value) && typeof value.path === 'string';
}

export function isRemoveTrackPayload(value: unknown): value is RemoveTrackPayload {
  return isRecord(value)
    && typeof value.path === 'string'
    && (value.unplayable === undefined || typeof value.unplayable === 'boolean');
}
