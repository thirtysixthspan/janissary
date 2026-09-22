import type { RemoteFrame } from './protocol.js';
import type { SessionRouter } from './channel-sessions.js';
import type { CaptureRequestTracker } from './channel-capture.js';

// The process-id-keyed frames — a spawned process's output/exit/history/detection frames, and the
// reply to an on-demand capture request — routed here rather than inline in `RemoteChannel.dispatch()`
// so that switch stays readable. Returns whether `frame` was one of these at all.
export function dispatchSessionFrame(frame: RemoteFrame, router: SessionRouter, captures: CaptureRequestTracker): boolean {
  if (frame.type === 'output') { router.output(frame); return true; }
  if (frame.type === 'shell-history') { router.history(frame); return true; }
  if (frame.type === 'gate-event') { router.gateEvent(frame); return true; }
  if (frame.type === 'busy-transition') { router.busyTransition(frame); return true; }
  if (frame.type === 'exit') { router.exit(frame); return true; }
  if (frame.type === 'capture-reply') { captures.resolve(frame); return true; }
  return false;
}
