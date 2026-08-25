import React from 'react';
import { FileOpenerPicker } from './FileOpenerPicker';
import type { PendingOpeners } from './useFileNavigatorOpener';
import { basename } from '../rel-path';

export function FileNavigatorOpenerOverlay({ pending, onPick }: { pending: PendingOpeners; onPick: (index: number) => void }) {
  return (
    <FileOpenerPicker
      name={basename(pending.path)} choices={pending.choices}
      selected={pending.selected} onPick={onPick}
    />
  );
}
