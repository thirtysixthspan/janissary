import type { ClientFrame } from '../protocol-frames.js';
import type { AcpSessionListener } from './acp.js';
import type { NavigatorListener } from './types.js';
import type { CaptureRequestTracker } from './capture.js';

export function unavailableSend(
  frame: ClientFrame,
  navigators: ReadonlyMap<string, NavigatorListener>,
  sessions: ReadonlyMap<string, AcpSessionListener>,
  captures: CaptureRequestTracker,
): void {
  switch (frame.type) {
  case 'filesystem-request': {
    navigators.get(frame.session)?.onReply({
      type: 'filesystem-reply', session: frame.session, request: frame.request, error: 'Remote connection unavailable.',
    });
    break;
  }
  case 'acp-open':
  case 'acp-run': {
    sessions.get(frame.id)?.onError('Remote connection unavailable.', true);
    break;
  }
  case 'acp-cancel': {
    sessions.get(frame.id)?.onError('ACP: cancellation failed: Remote connection unavailable.', true);
    break;
  }
  case 'capture-request': { captures.fail(frame.request, 'Remote connection unavailable.'); break; }
  default: { break; }
  }
}
