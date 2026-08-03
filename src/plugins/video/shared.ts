export const VIDEO_PAYLOAD_SCHEMA_VERSION = 1;

export type VideoPayload = {
  name: string;
  path: string;
  size: string;
  url: string;
  player: string;
};

export type CaptureFramePayload = { dataUrl: string };
export type CaptureFrameResult = { name: string };

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

export function isCaptureFramePayload(value: unknown): value is CaptureFramePayload {
  return isRecord(value) && typeof value.dataUrl === 'string';
}

export function isCaptureFrameResult(value: unknown): value is CaptureFrameResult {
  return isRecord(value) && typeof value.name === 'string';
}

export function isEmptyPayload(value: unknown): value is Record<string, never> {
  return isRecord(value) && Object.keys(value).length === 0;
}
