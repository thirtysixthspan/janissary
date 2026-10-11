import React, { useState } from 'react';

// The add-entry picker: a harness, a model, and an effort for one new entry, so an entry can be added
// without a pointer. The levels are the catalog the host published, so one the host knows appears here
// and in the card's per-entry dropdown at once. The picker owns its selection and unmounts when it
// closes, which is what keeps a choice made for one entry from reaching the next.
export function EntryPicker({
  harnesses, models, efforts, onAdd, onCancel,
}: {
  harnesses: string[];
  models: Record<string, string[]>;
  efforts: readonly string[];
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

  return (
    <div className="roles-picker">
      <select
        value={harness}
        aria-label="Harness for the new entry"
        onChange={(event) => changeHarness(event.target.value)}
      >
        {harnesses.map((name) => <option key={name} value={name}>{name}</option>)}
      </select>
      <select
        value={model}
        aria-label="Model for the new entry"
        onChange={(event) => setModel(event.target.value)}
      >
        <option value="">model…</option>
        {(models[harness] ?? []).map((name) => <option key={name} value={name}>{name}</option>)}
      </select>
      <select
        value={effort}
        aria-label="Effort for the new entry"
        onChange={(event) => setEffort(event.target.value)}
      >
        <option value="">default</option>
        {efforts.map((level) => <option key={level} value={level}>{level}</option>)}
      </select>
      <button type="button" onClick={() => onAdd(harness, model, effort)} disabled={!model}>Add</button>
      <button type="button" onClick={onCancel}>Cancel</button>
    </div>
  );
}