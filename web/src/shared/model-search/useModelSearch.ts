import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { contiguousMatch } from '../fuzzy-match';
import { useLatestRef } from '../useLatestRef';
import type { ModelSearchRow } from './ModelSearchList';
import { mostUsedModels, type HarnessModelPair } from './model-search';
import { handleModelSearchKey } from './model-search-keys';

const RESULT_CAP = 10;

export type ModelSearchListState = { open: boolean; highlighted: boolean };

type Options = {
  ids: string[];
  roleEntries: readonly (readonly HarnessModelPair[])[];
  harness: string;
  text: string;
  onChangeText: (text: string) => void;
  disabled: boolean;
  onSubmit?: () => void;
  onListChange?: (state: ModelSearchListState) => void;
};

type Override = { index: number; signature: string } | null;

export function useModelSearch({ ids, roleEntries, harness, text, onChangeText, disabled, onSubmit, onListChange }: Options) {
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
  const hasHighlight = highlighted !== null;
  const onListChangeRef = useLatestRef(onListChange);

  useEffect(() => {
    onListChangeRef.current?.({ open: isOpen, highlighted: hasHighlight });
  }, [isOpen, hasHighlight, onListChangeRef]);

  const close = () => { setOverride(null); setOpen(false); };
  const highlight = (index: number) => setOverride({ index, signature });
  const onPick = (id: string) => { onChangeText(id); close(); };

  return {
    rows,
    blank,
    open: isOpen,
    highlighted,
    onFocus: () => { setOverride(null); setOpen(true); },
    onBlur: close,
    onChange: (next: string) => { onChangeText(next); setOpen(true); },
    onHover: highlight,
    onPick,
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => handleModelSearchKey(event, {
      open: isOpen,
      highlighted,
      count: rows.length,
      text,
      ids,
    }, {
      open: () => setOpen(true),
      close,
      highlight,
      changeText: onChangeText,
      accept: () => { if (highlighted !== null) onPick(rows[highlighted].id); },
      submit: () => { onSubmit?.(); },
    }),
  };
}
