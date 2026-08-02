import { useCallback, useEffect, useRef, useState } from 'react';
import type { TabPluginClientCapabilities } from '../../api';
import { isVideoIntentReply, type VideoCaptureReply } from '../shared';

const CONFIRMATION_MS = 4000;

export function useVideoShot(
  videoRef: React.RefObject<HTMLVideoElement | null>, capabilities: TabPluginClientCapabilities,
) {
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const capture = useCallback(() => {
    const element = videoRef.current;
    if (!element?.videoWidth || !element.videoHeight) return;
    const canvas = document.createElement('canvas');
    canvas.width = element.videoWidth;
    canvas.height = element.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(element, 0, 0, canvas.width, canvas.height);
    setBusy(true);
    void capabilities.pluginIntent('capture-frame', { dataUrl: canvas.toDataURL('image/png') }).then((reply) => {
      setBusy(false);
      if (!isVideoIntentReply('capture-frame', reply.payload)) return;
      const result = reply.payload as VideoCaptureReply;
      setSaved(result.name);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { setSaved(null); }, CONFIRMATION_MS);
    }, () => { setBusy(false); });
  }, [capabilities, videoRef]);

  return { capture, saved, busy };
}
