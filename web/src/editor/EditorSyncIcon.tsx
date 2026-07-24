import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { EditorView } from '@shared/protocol';
import { syncIcon } from '../icons';

const TOOLTIPS: Record<NonNullable<EditorView['sync']>, string> = {
  provisioning: 'GitHub sync: provisioning workspace',
  syncing: 'GitHub sync: syncing',
  synced: 'GitHub sync: synced',
  error: 'GitHub sync: error — see notifications',
};

type Properties = { sync: EditorView['sync']; onClick?: () => void };

// A `synced` or `error` tab's icon becomes a resync button when `onClick` is provided —
// `provisioning` (no workspace yet) and `syncing` (already in flight) stay non-interactive
// regardless. There is still no UI toggle for enabling/disabling sync itself, only the config file.
const CLICKABLE_STATES = new Set<EditorView['sync']>(['synced', 'error']);

// Status icon reflecting a synced editor tab's GitHub sync state — renders nothing when `sync` is
// absent (an ordinary, non-synced editor tab).
export function EditorSyncIcon({ sync, onClick }: Properties) {
  if (!sync) return null;
  const clickable = !!onClick && CLICKABLE_STATES.has(sync);
  const className = `editor-sync-icon editor-sync-icon--${sync}${clickable ? ' editor-sync-icon--clickable' : ''}`;
  const title = clickable ? `${TOOLTIPS[sync]} — click to resync` : TOOLTIPS[sync];
  if (clickable) {
    return (
      <button type="button" className={className} title={title} onClick={onClick}>
        <FontAwesomeIcon icon={syncIcon} />
      </button>
    );
  }
  return (
    <span className={className} title={title}>
      <FontAwesomeIcon icon={syncIcon} />
    </span>
  );
}
