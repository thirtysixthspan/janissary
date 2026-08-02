export type VideoPayload = {
  name: string;
  path: string;
  size: string;
  url: string;
  player: string;
};

export type VideoCaptureFrame = { dataUrl: string };
export type VideoCaptureReply = { name: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isVideoPayload(value: unknown): value is VideoPayload {
  return isRecord(value)
    && typeof value.name === 'string'
    && typeof value.path === 'string'
    && typeof value.size === 'string'
    && typeof value.url === 'string'
    && typeof value.player === 'string';
}

export function isVideoIntent(intent: string, payload: unknown): boolean {
  if (!isRecord(payload)) return false;
  if (intent === 'capture-frame') return typeof payload.dataUrl === 'string';
  return intent === 'open-external' && Object.keys(payload).length === 0;
}

export function isVideoIntentReply(intent: string, payload: unknown): boolean {
  if (!isRecord(payload)) return false;
  if (intent === 'capture-frame') return typeof payload.name === 'string';
  return intent === 'open-external' && typeof payload.opened === 'boolean';
}
