import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { tabFlagDisplay, type TabPluginClientCapabilities } from '../api';

// The shell tab's recording flag — the same flag the host's own metadata row draws, from the same
// shared definition, so the two cannot drift.
//
// This plugin writes its own markup rather than importing `AgentTabMeta`, which is the independence
// it was built for and the reason the definition had to be published: a hand-written second copy of
// the flag would have had its own icon and its own tooltip, and nothing would have said when they
// came to disagree.
//
// The rules are the host's, restated rather than re-derived. Green and pressable exactly when the
// tab has a recording, plain and inert when it has not — and every shell tab records, so unlike a
// harness tab waiting on its workspace this one is drawn plain only until its shell has printed
// something. Absent handler means absent button: a disabled button is still focusable, so the inert
// flag is a `span` and the row is not one anybody tabs through.
export function ShellRecordingFlag({ capabilities }: { capabilities: TabPluginClientCapabilities }) {
  const display = tabFlagDisplay.recording;
  if (!display) return null;
  if (!capabilities.openRecording) {
    return (
      <span className="tab-flag tab-recording" role="img" aria-label={display.label} title={display.label}>
        <FontAwesomeIcon icon={display.icon} />
      </span>
    );
  }
  return (
    <button
      type="button"
      className="tab-flag tab-flag--active tab-recording"
      aria-label={display.label}
      title={display.label}
      onClick={() => { capabilities.openRecording?.(); }}
    >
      <FontAwesomeIcon icon={display.icon} />
    </button>
  );
}