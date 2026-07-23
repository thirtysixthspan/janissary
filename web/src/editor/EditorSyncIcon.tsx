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

type Properties = { sync: EditorView['sync'] };

// Read-only status icon reflecting a synced editor tab's GitHub sync state — renders nothing when
// `sync` is absent (an ordinary, non-synced editor tab). No click behavior: there is no
// interactive enable/disable control for syncing anywhere in the UI, only the config file.
export function EditorSyncIcon({ sync }: Properties) {
  if (!sync) return null;
  return (
    <span className={`editor-sync-icon editor-sync-icon--${sync}`} title={TOOLTIPS[sync]}>
      <FontAwesomeIcon icon={syncIcon} />
    </span>
  );
}
