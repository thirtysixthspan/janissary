import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { tabFlagDisplay } from './tab/flag-display';

// The recording flag: the one flag in the metadata row that is also a control, opening the tab's
// session recording when pressed.
//
// It is drawn green and pressable exactly when the tab has a recording, and plain and inert when it
// does not — which is a tab still provisioning, or one whose process has printed nothing yet. One
// fact decides both, so the row can never show a green flag that does nothing when pressed. That
// rule is why `tabFlagDisplay` marks the flag `pressable` rather than giving it a colour of its
// own: the colour follows the state, and the shell plugin's row derives it the same way from the
// same entry.
//
// A tab with no recording is drawn as a non-interactive `span` rather than a disabled `button`: a
// disabled button is still focusable, so this way a row nobody can use with is also a row nobody
// tabs through. The tooltip and accessible name are the same either way — what the flag is, not what
// it is doing — because the player follows a live recording exactly as it plays a finished one.
export function RecordingFlag({ onOpen }: { onOpen?: () => void }) {
  const display = tabFlagDisplay.recording;
  if (!display) return null;
  if (!onOpen) {
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
      onClick={onOpen}
    >
      <FontAwesomeIcon icon={display.icon} />
    </button>
  );
}