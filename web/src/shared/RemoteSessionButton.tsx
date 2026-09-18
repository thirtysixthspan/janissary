import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLinkSlash, faPlug, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { ConfirmDialog } from './ConfirmDialog';

// The detach/reattach control beside a remote tab's host chip — the second front door onto the same
// manager methods the sessions tab's rows use. It sits on `AgentTabMeta` because that is the one
// metadata row agent, shell, and harness tabs all render, so one placement covers every remote tab.
//
// Pressing detach parks the whole shared channel, closing every tab and navigator riding it, which
// is why the confirmation names what will go: a per-tab detach has no meaning, since the ssh
// connection would have to stay up for the others anyway.

export type RemoteSessionState = 'provisioning' | 'active' | 'reconnecting';

// Reattach on a live tab means "try now" — it collapses the reconnect backoff rather than opening a
// connection of its own.
function presentation(state: RemoteSessionState) {
  return state === 'reconnecting'
    ? { action: 'reattach' as const, icon: faPlug, label: 'Reattach' }
    : { action: 'detach' as const, icon: faLinkSlash, label: 'Detach' };
}

export function RemoteSessionButton({
  state,
  host,
  onAction,
}: {
  state: RemoteSessionState;
  host: string;
  onAction(action: 'detach' | 'reattach'): void | Promise<boolean>;
}) {
  const [confirming, setConfirming] = useState(false);
  // An action is in flight from the moment it is raised: a detach has to reach the far side and a
  // reattach has to authenticate, and neither is instant. It stops being in flight when the action
  // answers — including when it answers that it was refused. Waiting for the tab to unmount instead
  // left every outcome that leaves the tab open spinning for the life of that tab.
  const [pressed, setPressed] = useState(false);
  const { action, icon, label } = presentation(state);
  const busy = pressed;
  // There is nothing to come back to until the workspace clone has landed, so the control stays
  // where the eye expects it and is simply not pressable yet.
  const disabled = state === 'provisioning' || busy;

  const raise = (verb: 'detach' | 'reattach') => {
    setPressed(true);
    // A successful detach un-spins a moment before its tabs close, which looks briefly pressable on
    // a session that is already going. That is the cost of the control answering for every other
    // outcome instead of for none of them.
    void Promise.resolve(onAction(verb)).then(() => { setPressed(false); }, () => { setPressed(false); });
  };

  const press = () => {
    if (action === 'detach') { setConfirming(true); return; }
    raise(action);
  };

  return (
    <>
      <button
        type="button"
        className="tab-remote-session"
        disabled={disabled}
        title={`${label} this session on ${host}`}
        aria-label={`${label} session on ${host}`}
        onClick={press}
      >
        <FontAwesomeIcon icon={busy ? faSpinner : icon} spin={busy} />
      </button>
      {confirming && (
        <ConfirmDialog
          title={`Detach this session on ${host}? Its tabs will close.`}
          confirmLabel="Detach"
          onCancel={() => { setConfirming(false); }}
          onConfirm={() => {
            setConfirming(false);
            raise('detach');
          }}
        />
      )}
    </>
  );
}
