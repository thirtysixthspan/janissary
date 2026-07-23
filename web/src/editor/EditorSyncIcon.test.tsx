import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { EditorSyncIcon } from './EditorSyncIcon';

describe('EditorSyncIcon', () => {
  it('renders nothing when sync is absent', () => {
    const { container } = render(<EditorSyncIcon sync={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the provisioning state with its tooltip', () => {
    const { getByTitle } = render(<EditorSyncIcon sync="provisioning" />);
    expect(getByTitle('GitHub sync: provisioning workspace').className).toBe('editor-sync-icon editor-sync-icon--provisioning');
  });

  it('renders the syncing state with its tooltip', () => {
    const { getByTitle } = render(<EditorSyncIcon sync="syncing" />);
    expect(getByTitle('GitHub sync: syncing').className).toBe('editor-sync-icon editor-sync-icon--syncing');
  });

  it('renders the synced state with its tooltip', () => {
    const { getByTitle } = render(<EditorSyncIcon sync="synced" />);
    expect(getByTitle('GitHub sync: synced').className).toBe('editor-sync-icon editor-sync-icon--synced');
  });

  it('renders the error state with its fixed, non-per-failure tooltip', () => {
    const { getByTitle } = render(<EditorSyncIcon sync="error" />);
    expect(getByTitle('GitHub sync: error — see notifications').className).toBe('editor-sync-icon editor-sync-icon--error');
  });
});
