import React, { useEffect, useRef, useState } from 'react';
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
//
// Opening the tab starts the video: the body mounts once per open, so a single mount-time `play()`
// is the whole of that behavior. It is gated on the tab being the visible one, which keeps a reload
// of the web page from starting every open video at once, and a refusal by the browser's autoplay
// policy is a normal outcome — the video simply stays paused with its controls.
export function VideoTab({
  payload: video,
  capabilities,
}: { payload: VideoPayload; capabilities: TabPluginClientCapabilities }) {
  const [failed, setFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { capture, saved, busy } = useVideoShot(videoRef, capabilities);
  const source = capabilities.resourceUrl(video.url);
  const openLabel = video.player ? `Open in ${video.player}` : 'Open externally';
  const activeOnMount = useRef(capabilities.active);

  useEffect(() => {
    if (!activeOnMount.current) return;
    // `play()` answers with a promise wherever the media pipeline is real, and with nothing where it
    // is not, so the rejection handler is attached defensively rather than to the call itself.
    const started: Promise<void> | undefined = videoRef.current?.play();
    void started?.catch(() => {
      // The browser's autoplay policy refused; the video waits on its own controls.
    });
  }, []);

  return (
    <div className="video-tab plugin-tab" data-doc-shot="video-view">
      <div className="plugin-meta">
        <span className="plugin-name">{video.name}</span>
        <span className="image-size">{video.size}</span>
        <span className="plugin-loc">{video.path}</span>
        {saved && <span className="video-shot-saved">Saved {saved}</span>}
        <span className="plugin-actions">
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
      <div className="plugin-stage">
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
