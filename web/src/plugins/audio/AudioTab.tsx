import React, { useEffect, useRef } from 'react';
import type { AudioPayload, AudioTrack } from '@shared/plugins/audio/shared';
import type { TabPluginClientCapabilities } from '../api';
import { Playlist } from './Playlist';
import { audioTransport, useAudioKeys } from './useAudioKeys';

// The audio player tab body: a compact metadata and transport header, a native `<audio controls>`
// element, and the playlist filling the remaining space. The native controls own the timeline,
// scrubbing, and volume — nothing here rebuilds them — while the transport row adds the five actions
// the key bindings also drive, so no action is keyboard-only.
//
// The tab is a singleton that owns a queue rather than one tab per file, so it never closes itself:
// an emptied playlist shows `No tracks queued` where the player was and waits to be refilled.
export function AudioTab({
  payload: audio, capabilities,
}: { payload: AudioPayload; capabilities: TabPluginClientCapabilities }) {
  const playerRef = useRef<HTMLAudioElement>(null);
  const active = capabilities.active;
  const track = audio.current === null ? undefined : audio.tracks[audio.current];

  const send = (name: string, payload: unknown) => {
    void capabilities.intent(name, payload).catch(() => {
      // A rejected intent is the server refusing one request; the queue it already holds stands.
    });
  };
  const select = (entry: AudioTrack) => { send('select-track', { path: entry.path }); };
  const remove = (entry: AudioTrack) => { send('remove-track', { path: entry.path }); };

  // Stepping through the queue is expressed entirely as "make that entry current": the client holds
  // the list, so it can name the neighbour, and the server stays the only thing that owns the queue.
  const step = (delta: number) => {
    if (audio.current === null) return;
    const neighbour = audio.tracks[audio.current + delta];
    if (neighbour) select(neighbour);
  };

  const transport = audioTransport(playerRef, {
    previous: () => { step(-1); },
    next: () => { step(1); },
  });
  useAudioKeys(active, transport);

  // Each new track starts playing on its own, so opening a file and advancing through the queue both
  // behave the same way. Gated on the tab being visible, which keeps a reload of the web page from
  // starting every open player at once; a refusal by the browser's autoplay policy is a normal
  // outcome, and the track simply waits on its own controls.
  useEffect(() => {
    if (!active || !track) return;
    const started: Promise<void> | undefined = playerRef.current?.play();
    void started?.catch(() => {});
  }, [active, track?.path]); // eslint-disable-line react-hooks/exhaustive-deps -- the track's path is its identity

  const source = track ? capabilities.resourceUrl(track.url) : '';

  return (
    <div
      className={capabilities.dock ? 'audio-tab image-tab audio-tab-docked' : 'audio-tab image-tab'}
      data-doc-shot="audio-view"
    >
      <div className="image-meta">
        <span className="image-name">{track?.name ?? 'No tracks queued'}</span>
        {track && <span className="image-size">{audio.size}</span>}
        {track && <span className="image-loc">{track.path}</span>}
        <span className="audio-transport">
          <button type="button" title="Previous track" aria-label="Previous track" onClick={transport.previous}>⏮</button>
          <button type="button" title="Back 10 seconds" aria-label="Back 10 seconds" onClick={transport.seekBackward}>⏪</button>
          <button type="button" title="Play or pause" aria-label="Play or pause" onClick={transport.toggle}>⏯</button>
          <button type="button" title="Forward 10 seconds" aria-label="Forward 10 seconds" onClick={transport.seekForward}>⏩</button>
          <button type="button" title="Next track" aria-label="Next track" onClick={transport.next}>⏭</button>
        </span>
        <span className="image-actions">{capabilities.splitAction}</span>
      </div>
      {track ? (
        <audio
          ref={playerRef}
          className="audio-player"
          src={source}
          controls
          onEnded={() => { step(1); }}
          onError={() => { send('remove-track', { path: track.path, unplayable: true }); }}
        />
      ) : (
        <div className="audio-empty">No tracks queued</div>
      )}
      <Playlist
        tracks={audio.tracks}
        current={audio.current}
        onSelect={select}
        onRemove={remove}
      />
    </div>
  );
}
