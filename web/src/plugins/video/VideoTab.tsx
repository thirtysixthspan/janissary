import React, { useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCamera } from '@fortawesome/free-solid-svg-icons';
import type { VideoPayload } from '@shared/plugins/video/shared';
import type { TabPluginClientCapabilities } from '../api';
import { useVideoShot } from './useVideoShot';

// A video view tab body: the same compact metadata header the image tab uses (name, size, location)
// above a native `<video controls>` element filling the remaining space. There is no custom
// transport UI — the native controls own playback and the keyboard while focused.
//
// The browser can still fail to decode a container this opener claims as playable (an unsupported
// codec inside an `.mp4`, a corrupt file). That replaces the player with a short message and a
// button handing the file to the configured external player. Nothing launches on its own.
export function VideoTab({
  payload: video,
  capabilities,
}: { payload: VideoPayload; capabilities: TabPluginClientCapabilities }) {
  const [failed, setFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { capture, saved, busy } = useVideoShot(videoRef, capabilities);
  const source = capabilities.resourceUrl(video.url);
  const openLabel = video.player ? `Open in ${video.player}` : 'Open externally';

  return (
    <div className="video-tab image-tab" data-doc-shot="video-view">
      <div className="image-meta">
        <span className="image-name">{video.name}</span>
        <span className="image-size">{video.size}</span>
        <span className="image-loc">{video.path}</span>
        {saved && <span className="video-shot-saved">Saved {saved}</span>}
        <span className="image-actions">
          {!failed && (
            <button
              type="button"
              className="tab-split"
              title="Capture frame"
              aria-label="Capture frame"
              disabled={busy}
              onClick={capture}
            >
              <FontAwesomeIcon icon={faCamera} />
            </button>
          )}
          {capabilities.splitAction}
        </span>
      </div>
      <div className="image-stage">
        {failed ? (
          <div className="video-unplayable">
            <p>This video cannot be played in the app.</p>
            <p className="video-unplayable-path">{video.path}</p>
            <button
              type="button"
              onClick={() => { void capabilities.intent('open-external', {}); }}
            >
              {openLabel}
            </button>
          </div>
        ) : (
          <video
            ref={videoRef}
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
