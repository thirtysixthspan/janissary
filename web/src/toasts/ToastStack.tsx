import type { JanusClient } from '../ws';
import { useToasts } from './useToasts';

// The window's upper-right corner: a fixed stack of transient notification lines, shown when no
// notifications feed is on screen to carry them. It begins beneath the connection indicator and the
// status panels that already float there — a toast must never hide "Cannot reach session", which is
// very often the reason notifications started arriving in the first place.
//
// A click asks the server to make the feed visible; the server answers by docking it in and
// clearing the corner, so this component does not empty the stack itself.
export function ToastStack({ client }: { client: JanusClient }) {
  const { toasts, hold, release } = useToasts(client);
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack">
      {toasts.map((toast) => (
        <button
          type="button"
          key={toast.id}
          className={`toast${toast.phase === 'fading' && !toast.held ? ' toast--fading' : ''}`}
          onMouseEnter={() => hold(toast.id)}
          onMouseLeave={() => release(toast.id)}
          onFocus={() => hold(toast.id)}
          onBlur={() => release(toast.id)}
          onClick={() => client.send({ method: 'revealNotifications', params: {} })}
        >
          <span className="dot" style={toast.color ? { color: toast.color } : undefined}>●</span>
          <span className="toast-from">{toast.from}:</span>
          <span className="toast-message">{toast.message}</span>
        </button>
      ))}
    </div>
  );
}
