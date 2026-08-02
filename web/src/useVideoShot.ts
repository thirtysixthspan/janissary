import { useCallback, useEffect, useRef, useState } from 'react';
import type { VideoView } from '@shared/protocol';
import type { JanusClient } from './ws';

// How long the saved-file name stays in the video tab's header after a capture.
const CONFIRMATION_MS = 4000;

// Capture the frame currently on screen in a video tab and hand it to the server to write beside
// the video file. The frame only exists in the browser's decoder, so the draw happens here; the
// server owns the filename entirely (see `src/video-shot.ts`), which is why nothing but the tab's
// own `/open/<id>` ref goes over the wire alongside the pixels.
export function useVideoShot(
  videoRef: React.RefObject<HTMLVideoElement | null>, video: VideoView, client: JanusClient,
) {
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

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
    void client.request<{ name: string }>({
      method: 'captureVideoFrame', params: { url: video.url, dataUrl: canvas.toDataURL('image/png') },
    }).then((result) => {
      setBusy(false);
      if (!result?.name) return;
      setSaved(result.name);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { setSaved(null); }, CONFIRMATION_MS);
    }, () => { setBusy(false); });
  }, [videoRef, video.url, client]);

  return { capture, saved, busy };
}
