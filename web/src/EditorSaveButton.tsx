import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { saveIcon } from './icons';

type Properties = {
  dirty: boolean;
  onSave: () => void;
};

export function EditorSaveButton({ dirty, onSave }: Properties) {
  return (
    <button
      type="button"
      className="editor-save-button"
      aria-label="Save file"
      title="Save"
      disabled={!dirty}
      onClick={onSave}
    >
      <FontAwesomeIcon icon={saveIcon} />
    </button>
  );
}
