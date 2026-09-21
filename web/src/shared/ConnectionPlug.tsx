import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { connectionStatusIcon } from '../icons';

// A connection's status, as one plug coloured by what the connection is doing. Both surfaces that
// show a remote session — the sessions tab's State column and a remote tab's metadata row — render
// this rather than describing the state in glyphs of their own, so the colour means the same thing
// in both places.
//
// The colours are the stylesheet's, keyed off `data-state`: green for a connection that is up, blue
// for one parked on its host, red for one that is over. The two unsettled states carry no colour of
// their own, because neither has arrived anywhere yet.

export type ConnectionPlugState =
  | 'provisioning' | 'active' | 'reconnecting' | 'detached' | 'terminated';

const LABELS: Record<ConnectionPlugState, string> = {
  provisioning: 'Provisioning',
  active: 'Connected',
  reconnecting: 'Reconnecting',
  detached: 'Detached',
  terminated: 'Terminated',
};

export function ConnectionPlug({ state }: { state: ConnectionPlugState }) {
  const label = LABELS[state];
  return (
    <span className="connection-plug" data-state={state} role="img" aria-label={label} title={label}>
      <FontAwesomeIcon icon={connectionStatusIcon} />
    </span>
  );
}
