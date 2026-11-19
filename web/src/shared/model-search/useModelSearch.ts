import { useMemo, useState } from 'react';
import { contiguousMatch } from '../fuzzy-match';
import type { ModelSearchRow } from './ModelSearchList';
import { mostUsedModels, type HarnessModelPair } from './model-search';

const RESULT_CAP = 10;

type Options = {
  ids: string[];
  roleEntries: readonly (readonly HarnessModelPair[])[];
  harness: string;
  text: string;
  onChangeText: (text: string) => void;
  disabled: boolean;
};

type Override = { index: number; signature: string } | null;

export function useModelSearch({ ids, roleEntries, harness, text, onChangeText, disabled }: Options) {
  const [open, setOpen] = useState(false);
  const [override, setOverride] = useState<Override>(null);
  const blank = text.trim().length === 0;

  const rows = useMemo<ModelSearchRow[]>(() => {
    if (blank) {
      return mostUsedModels(roleEntries, harness, ids).map((id) => ({ id, ranges: [] }));
    }
    return contiguousMatch(ids, text, RESULT_CAP).map((match) => ({ id: match.path, ranges: match.ranges }));
  }, [blank, ids, roleEntries, harness, text]);

  const signature = JSON.stringify([blank, rows.map((row) => row.id)]);
  const defaultHighlighted = blank || rows.length === 0 ? null : 0;
  const isOpen = open && !disabled;
  const effectiveOverride = override && override.signature === signature ? override.index : null;
  const highlighted = isOpen ? effectiveOverride ?? defaultHighlighted : null;

  return {
    rows,
    blank,
    open: isOpen,
    highlighted,
    onFocus: () => { setOverride(null); setOpen(true); },
    onBlur: () => { setOverride(null); setOpen(false); },
    onChange: (next: string) => { onChangeText(next); setOpen(true); },
    onHover: (index: number) => setOverride({ index, signature }),
    onPick: (id: string) => { onChangeText(id); setOverride(null); setOpen(false); },
  };
}
