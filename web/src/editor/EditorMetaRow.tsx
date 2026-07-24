import React from 'react';
import type { EditorView } from '@shared/protocol';
import { EditorSaveButton } from '../EditorSaveButton';
import { StatusWindowButton } from '../StatusWindowButton';
import type { StatusWindowButtonProps } from '../AgentTabMeta';
import { connectionsWindowIcon } from '../icons';
import { EditorSyncIcon } from './EditorSyncIcon';

type Properties = {
  editor: EditorView;
  dirty: boolean;
  savedFlash: boolean;
  error: string | null;
  onSave: () => void;
  onMouseUp: () => void;
  connectionsButton: StatusWindowButtonProps;
  onSyncClick?: () => void;
};

// The editor tab's single metadata row: name/size/path, save state, and the connections button.
// Split out so EditorTab.tsx stays under the 200-line file cap.
export function EditorMetaRow({ editor, dirty, savedFlash, error, onSave, onMouseUp, connectionsButton, onSyncClick }: Properties) {
  return (
    <div className="editor-meta" onMouseUp={onMouseUp}>
      <span className="editor-name">{editor.name}</span>
      <span className="editor-size">{editor.size}</span>
      <span className="editor-loc">{editor.path}</span>
      {savedFlash && <span className="editor-saved">Saved</span>}
      {error && <span className="editor-error">{error}</span>}
      <EditorSyncIcon sync={editor.sync} onClick={onSyncClick} />
      <EditorSaveButton dirty={dirty} onSave={onSave} />
      <StatusWindowButton
        icon={connectionsWindowIcon}
        className="tab-connections"
        hasContent={connectionsButton.hasContent}
        activeTitle="connections"
        emptyTitle="no active connections"
        onEnter={connectionsButton.onEnter}
        onLeave={connectionsButton.onLeave}
        onClick={connectionsButton.onClick}
      />
    </div>
  );
}
