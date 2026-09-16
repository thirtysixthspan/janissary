import React from 'react';
import type { EditorView } from '@shared/protocol';
import { EditorSaveButton } from './EditorSaveButton';
import { StatusWindowButton } from '../shared/status-windows/StatusWindowButton';
import type { StatusWindowButtonProps } from '../shared/status-windows/status-button';
import { connectionsWindowIcon } from '../icons';
import { EditorSyncIcon } from './EditorSyncIcon';
import { SplitTabButton } from '../SplitTabButton';
import { EditorMetaName } from './EditorMetaName';
import { EditorCommitButton } from './EditorCommitButton';

type Properties = {
  editor: EditorView;
  dirty: boolean;
  savedFlash: boolean;
  error: string | null;
  onSave: () => void;
  onMouseUp: () => void;
  connectionsButton: StatusWindowButtonProps;
  onSyncClick?: () => void;
  onSplit?: () => void;
  onRename: (next: string) => void;
  onRenameCancel: () => void;
  onRenameEditingChange: (editing: boolean) => void;
  onCommitOrigin: () => void;
};

// The editor tab's single metadata row: name/size/path, save state, and the connections button.
// Split out so EditorTab.tsx stays under the 200-line file cap.
export function EditorMetaRow({
  editor, dirty, savedFlash, error, onSave, onMouseUp, connectionsButton, onSyncClick, onSplit,
  onRename, onRenameCancel, onRenameEditingChange, onCommitOrigin,
}: Properties) {
  return (
    <div className="editor-meta" onMouseUp={onMouseUp}>
      <EditorMetaName
        editor={editor} onCommit={onRename} onCancel={onRenameCancel}
        onEditingChange={onRenameEditingChange}
      />
      <span className="editor-size">{editor.size}</span>
      <span className="editor-loc">{editor.path}</span>
      {savedFlash && <span className="editor-saved">Saved</span>}
      {error && <span className="editor-error">{error}</span>}
      <span className="editor-actions">
        <EditorSyncIcon sync={editor.sync} onClick={onSyncClick} />
        <EditorSaveButton dirty={dirty} onSave={onSave} />
        <EditorCommitButton commit={editor.commit} onClick={onCommitOrigin} />
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
        {onSplit && <SplitTabButton onClick={onSplit} />}
      </span>
    </div>
  );
}
