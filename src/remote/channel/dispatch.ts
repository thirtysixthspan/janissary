import type { RemoteFrame } from '../protocol-frames.js';
import type { SessionRouter } from './sessions.js';
import type { CaptureRequestTracker } from './capture.js';
import type { NavigatorListener } from './types.js';

// The process-id-keyed frames — a spawned process's output/exit/history/detection frames, and the
// reply to an on-demand capture request — routed here rather than inline in `RemoteChannel.dispatch()`
// so that switch stays readable. Returns whether `frame` was one of these at all.
export function dispatchSessionFrame(frame: RemoteFrame, router: SessionRouter, captures: CaptureRequestTracker): boolean {
  if (frame.type === 'output') { router.output(frame); return true; }
  if (frame.type === 'shell-history') { router.history(frame); return true; }
  if (frame.type === 'gate-event') { router.gateEvent(frame); return true; }
  if (frame.type === 'busy-transition') { router.busyTransition(frame); return true; }
  if (frame.type === 'resume-event') { router.resumeEvent(frame); return true; }
  if (frame.type === 'resume-cancel') { router.resumeCancel(frame); return true; }
  if (frame.type === 'exit') { router.exit(frame); return true; }
  if (frame.type === 'capture-reply') { captures.resolve(frame); return true; }
  return false;
}

// The filesystem reply and event frames are addressed to a navigator rather than to a process.
// The two discriminants are claimed even when no navigator is attached, so an unknown session is a
// no-op instead of a channel fault.
export function dispatchNavigatorFrame(frame: RemoteFrame, navigators: ReadonlyMap<string, NavigatorListener>): boolean {
  if (frame.type === 'filesystem-reply') {
    navigators.get(frame.session)?.onReply(frame);
    return true;
  }
  if (frame.type === 'filesystem-event') {
    navigators.get(frame.session)?.onEvent(frame.path);
    return true;
  }
  return false;
}
