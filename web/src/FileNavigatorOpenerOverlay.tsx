import React from 'react';
import { FileOpenerPicker } from './FileOpenerPicker';
import type { PendingOpeners } from './useFileNavigatorOpener';

export function FileNavigatorOpenerOverlay({ pending, onPick }: { pending: PendingOpeners; onPick: (index: number) => void }) {
  return (
    <FileOpenerPicker
      name={pending.path.slice(pending.path.lastIndexOf('/') + 1)} choices={pending.choices}
      selected={pending.selected} onPick={onPick}
    />
  );
}
