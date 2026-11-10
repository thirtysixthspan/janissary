import { useCallback, useState } from 'react';
import {
  isCaptureFrameResult,
} from '@shared/plugins/video/shared';
import { useTransientValue, type TabPluginClientCapabilities } from '../api';

// How long the saved-file name stays in the video tab's header after a capture.
const CONFIRMATION_MS = 4000;

// Capture the frame currently on screen in a video tab and hand it to the server to write beside
// the video file. The frame only exists in the browser's decoder, so the draw happens here; the
// server owns the filename and destination entirely (see `src/plugins/video/shot.ts`), so only the
// decoded pixels cross the tab-bound intent boundary.
export function useVideoShot(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  capabilities: TabPluginClientCapabilities,
) {
  const [saved, showSaved] = useTransientValue<string>(CONFIRMATION_MS);
  const [busy, setBusy] = useState(false);

  const capture = useCallback(() => {
    const element = videoRef.current;
    // `videoWidth` stays 0 until the first frame has decoded — there is nothing to capture yet.
    if (!element?.videoWidth || !element.videoHeight) return;

    const canvas = document.createElement('canvas');
    canvas.width = element.videoWidth;
    canvas.height = element.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(element, 0, 0, canvas.width, canvas.height);

    setBusy(true);
    void capabilities.intent<unknown>('capture-frame', {
      dataUrl: canvas.toDataURL('image/png'),
    }).then((result) => {
      setBusy(false);
      if (!isCaptureFrameResult(result)) {
        capabilities.reportFailure('invalid capture-frame result');
        return;
      }
      showSaved(result.name);
    }, () => { setBusy(false); });
  }, [videoRef, capabilities, showSaved]);

  return { capture, saved, busy };
}
