import React, { useState, type KeyboardEvent, type RefObject } from 'react';
import type { RoleEntry } from '@shared/plugins/roles/shared';
import { ModelSearchInput } from '../api';

function isExactEnabledId(model: string, ids: readonly string[]): boolean {
  return ids.includes(model.trim());
}

// The add-entry picker: a harness, a model, and an effort for one new entry, so an entry can be added
// without a pointer. The levels are the catalog the host published, so one the host knows appears here
// and in the card's per-entry dropdown at once. The picker owns its selection and unmounts when it
// closes, which is what keeps a choice made for one entry from reaching the next.
export function EntryPicker({
  harnesses, models, efforts, roleEntries, firstControlRef, onAdd, onCancel,
}: {
  harnesses: string[];
  models: Record<string, string[]>;
  efforts: readonly string[];
  roleEntries: readonly (readonly RoleEntry[])[];
  firstControlRef: RefObject<HTMLSelectElement | null>;
  onAdd(harness: string, model: string, effort: string): void;
  onCancel(): void;
}) {
  const [harness, setHarness] = useState(harnesses[0] ?? '');
  const [model, setModel] = useState('');
  const [effort, setEffort] = useState('');

  // A different harness has different models and its own effort vocabulary, so the model's choice and
  // the effort go with the harness rather than carrying over to a model they were never chosen for.
  const changeHarness = (next: string) => {
    setHarness(next);
    setModel('');
    setEffort('');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    onCancel();
  };

  const ids = models[harness] ?? [];
  const add = () => {
    if (!isExactEnabledId(model, ids)) return;
    onAdd(harness, model.trim(), effort);
  };

  return (
    <div className="roles-picker" onKeyDown={handleKeyDown}>
      <select
        ref={firstControlRef}
        value={harness}
        aria-label="Harness for the new entry"
        onChange={(event) => changeHarness(event.target.value)}
      >
        {harnesses.map((name) => <option key={name} value={name}>{name}</option>)}
      </select>
      <ModelSearchInput
        ids={ids}
        roleEntries={roleEntries}
        harness={harness}
        value={model}
        onChange={setModel}
        onSubmit={add}
        placeholder="model…"
        aria-label="Model for the new entry"
      />
      <select
        value={effort}
        aria-label="Effort for the new entry"
        onChange={(event) => setEffort(event.target.value)}
      >
        <option value="">default</option>
        {efforts.map((level) => <option key={level} value={level}>{level}</option>)}
      </select>
      <button
        type="button"
        onClick={add}
        disabled={!isExactEnabledId(model, ids)}
      >
        Add
      </button>
      <button type="button" onClick={onCancel}>Cancel</button>
    </div>
  );
}
