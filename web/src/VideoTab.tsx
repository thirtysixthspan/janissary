import React, { useState } from 'react';
import type { VideoView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { SplitTabButton } from './SplitTabButton';

// A video view tab body: the same compact metadata header the image tab uses (name, size, location)
// above a native `<video controls>` element filling the remaining space. There is no custom
// transport UI — the native controls own playback and the keyboard while focused.
//
// The browser can still fail to decode a container this opener claims as playable (an unsupported
// codec inside an `.mp4`, a corrupt file). That replaces the player with a short message and a
// button handing the file to the configured external player. Nothing launches on its own.
export function VideoTab({
  video, client, onSplit,
}: { video: VideoView; client: JanusClient; onSplit?: () => void }) {
  const [failed, setFailed] = useState(false);
  const token = new URLSearchParams(location.search).get('token') ?? '';
  const source = `${video.url}?token=${encodeURIComponent(token)}`;
  const openLabel = video.player ? `Open in ${video.player}` : 'Open externally';

  return (
    <div className="video-tab image-tab" data-doc-shot="video-view">
      <div className="image-meta">
        <span className="image-name">{video.name}</span>
        <span className="image-size">{video.size}</span>
        <span className="image-loc">{video.path}</span>
        {onSplit && <span className="image-actions"><SplitTabButton onClick={onSplit} /></span>}
      </div>
      <div className="image-stage">
        {failed ? (
          <div className="video-unplayable">
            <p>This video cannot be played in the app.</p>
            <p className="video-unplayable-path">{video.path}</p>
            <button
              type="button"
              onClick={() => client.send({ method: 'command', params: { text: `open external ${video.path}` } })}
            >
              {openLabel}
            </button>
          </div>
        ) : (
          <video
            className="video-player"
            src={source}
            controls
            onError={() => { setFailed(true); }}
          />
        )}
      </div>
    </div>
  );
}
