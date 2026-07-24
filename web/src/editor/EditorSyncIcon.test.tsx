import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
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

  describe('resync button', () => {
    it('renders synced as a clickable button that calls onClick', () => {
      const onClick = vi.fn();
      const { getByTitle } = render(<EditorSyncIcon sync="synced" onClick={onClick} />);
      const button = getByTitle('GitHub sync: synced — click to resync');
      expect(button.tagName).toBe('BUTTON');
      expect(button.className).toContain('editor-sync-icon--clickable');
      fireEvent.click(button);
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('renders error as a clickable button that calls onClick', () => {
      const onClick = vi.fn();
      const { getByTitle } = render(<EditorSyncIcon sync="error" onClick={onClick} />);
      const button = getByTitle('GitHub sync: error — see notifications — click to resync');
      fireEvent.click(button);
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('stays non-interactive while provisioning even when onClick is provided', () => {
      const onClick = vi.fn();
      const { getByTitle } = render(<EditorSyncIcon sync="provisioning" onClick={onClick} />);
      const el = getByTitle('GitHub sync: provisioning workspace');
      expect(el.tagName).toBe('SPAN');
      expect(el.className).not.toContain('clickable');
    });

    it('stays non-interactive while syncing even when onClick is provided', () => {
      const onClick = vi.fn();
      const { getByTitle } = render(<EditorSyncIcon sync="syncing" onClick={onClick} />);
      const el = getByTitle('GitHub sync: syncing');
      expect(el.tagName).toBe('SPAN');
      expect(el.className).not.toContain('clickable');
    });
  });
});
