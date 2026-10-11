import React, { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faTrash } from '@fortawesome/free-solid-svg-icons';
import type { Role } from '@shared/plugins/roles/shared';
import type { TabPluginClientCapabilities } from '../api';
import {
  allowDrop, dragEnd, dragEntry, dragRole, dropOnEntry, dropOnRole,
} from './roles-dnd';
import { useRoleDraft } from './useRoleDraft';

type Properties = {
  role: Role;
  index: number;
  efforts: readonly string[];
  models: Record<string, string[]>;
  capabilities: TabPluginClientCapabilities;
  onRefusal: (message: string | null) => void;
};

type EntryDrop = { intent: string; payload: Record<string, unknown> } | null;

// One role card: the name and description edit in place, the entries below carry their effort and a
// remove control, and the card itself is both a drag source (the grip moves the role) and a drop
// target (a catalog model lands here as a new entry). Every edit is one intent; the card owns no
// rule of its own.
export function RoleCard({ role, index, efforts, models, capabilities, onRefusal }: Properties) {
  const nameDraft = useRoleDraft(role.name);
  const descriptionDraft = useRoleDraft(role.description);
  const [picker, setPicker] = useState(false);
  const [pickHarness, setPickHarness] = useState(Object.keys(models)[0] ?? '');
  const [pickModel, setPickModel] = useState('');
  const [drop, setDrop] = useState(false);

  // A stored value that arrived while this card was holding a draft has already replaced that draft,
  // so the one line the tab shows for every other refusal is also what explains this one.
  useEffect(() => {
    if (nameDraft.conflicted) {
      onRefusal(`The name of "${role.name}" changed elsewhere — showing the stored one.`);
    }
    if (descriptionDraft.conflicted) {
      onRefusal(`The description of "${role.name}" changed elsewhere — showing the stored one.`);
    }
  }, [descriptionDraft.conflicted, nameDraft.conflicted, onRefusal, role.name]);

  const raise = (intent: string, payload: Record<string, unknown>) => {
    onRefusal(null);
    void capabilities.intent(intent, payload).catch((error: unknown) => {
      onRefusal(String(error instanceof Error ? error.message : error));
    });
  };

  const commitName = () => {
    const change = nameDraft.commit();
    if (change === null) return;
    const trimmed = change.text.trim();
    if (trimmed.length === 0 || trimmed === role.name) nameDraft.revert();
    else raise('rename-role', { name: role.name, next: trimmed });
  };

  const commitDescription = () => {
    const change = descriptionDraft.commit();
    if (change === null) return;
    // The stored text the edit was written against travels with it: the server refuses rather than
    // overwrite a description another client changed while this one was in flight.
    raise('describe-role', { name: role.name, description: change.text, expected: change.baseline });
  };

  const modelOptions = models[pickHarness] ?? [];

  const addPicked = () => {
    if (!pickHarness || !pickModel) return;
    raise('add-entry', { role: role.name, entry: { harness: pickHarness, model: pickModel } });
    setPicker(false);
  };

  const land = (result: EntryDrop) => {
    setDrop(false);
    if (result) raise(result.intent, result.payload);
  };

  return (
    <div
      className={drop ? 'roles-card roles-drop' : 'roles-card'}
      onDragOver={(event) => {
        allowDrop(event, (drag) => drag.kind === 'catalog' || drag.kind === 'role');
        if (event.defaultPrevented) setDrop(true);
      }}
      onDragLeave={() => setDrop(false)}
      onDrop={(event) => land(dropOnRole(event, role.name, index))}
    >
      <div className="roles-card-head">
        <span
          className="roles-grip"
          draggable
          onDragStart={(event) => dragRole(event, role.name)}
          onDragEnd={dragEnd}
          title="Drag to reorder"
          aria-hidden
        >
          &#8942;&#8942;
        </span>
        <input
          className="roles-name"
          value={nameDraft.value}
          aria-label={`Name of role ${role.name}`}
          onChange={(event) => nameDraft.set(event.target.value)}
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            else if (event.key === 'Escape') nameDraft.revert();
          }}
        />
        <button
          type="button"
          className="roles-icon"
          title={`Delete role ${role.name}`}
          onClick={() => raise('delete-role', { name: role.name })}
        >
          <FontAwesomeIcon icon={faTrash} />
        </button>
      </div>
      <input
        className="roles-description"
        value={descriptionDraft.value}
        placeholder="Description"
        aria-label={`Description of role ${role.name}`}
        onChange={(event) => descriptionDraft.set(event.target.value)}
        onBlur={commitDescription}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          else if (event.key === 'Escape') descriptionDraft.revert();
        }}
      />
      <ul className="roles-entries">
        {role.entries.map((entry, position) => {
          // An effort the catalog does not offer still has to be visible: the file stores any string
          // verbatim, so a value with no option would render the row as though it held none.
          const stored = entry.effort !== undefined && !efforts.includes(entry.effort) ? entry.effort : null;
          return (
          <li
            key={`${entry.harness}:${entry.model}:${position}`}
            className="roles-entry"
            draggable
            onDragStart={(event) => dragEntry(event, role.name, position)}
            onDragEnd={dragEnd}
            onDragOver={(event) => allowDrop(event, (drag) => drag.kind === 'entry')}
            onDrop={(event) => {
              const result = dropOnEntry(event, role.name, position);
              if (result) raise(result.intent, result.payload);
            }}
          >
            <span className="roles-entry-model">{entry.model}</span>
            <span className="roles-entry-harness">{entry.harness}</span>
            <select
              className="roles-effort"
              value={entry.effort ?? ''}
              aria-label={`Effort for ${entry.model}`}
              onChange={(event) =>
                raise('set-entry-effort', {
                  role: role.name,
                  index: position,
                  effort: event.target.value === '' ? null : event.target.value,
                })}
            >
              <option value="">default</option>
              {stored === null ? null : <option value={stored}>{stored}</option>}
              {efforts.map((effort) => <option key={effort} value={effort}>{effort}</option>)}
            </select>
            <button
              type="button"
              className="roles-icon"
              title={`Remove ${entry.model}`}
              onClick={() => raise('remove-entry', { role: role.name, index: position })}
            >
              <FontAwesomeIcon icon={faTrash} />
            </button>
          </li>
          );
        })}
      </ul>
      {picker ? (
        <div className="roles-picker">
          <select
            value={pickHarness}
            aria-label="Harness for the new entry"
            onChange={(event) => {
              setPickHarness(event.target.value);
              setPickModel('');
            }}
          >
            {Object.keys(models).map((harness) => <option key={harness} value={harness}>{harness}</option>)}
          </select>
          <select
            value={pickModel}
            aria-label="Model for the new entry"
            onChange={(event) => setPickModel(event.target.value)}
          >
            <option value="">model…</option>
            {modelOptions.map((model) => <option key={model} value={model}>{model}</option>)}
          </select>
          <button type="button" onClick={addPicked} disabled={!pickModel}>Add</button>
          <button type="button" onClick={() => setPicker(false)}>Cancel</button>
        </div>
      ) : (
        <button type="button" className="roles-add-entry" onClick={() => setPicker(true)}>
          <FontAwesomeIcon icon={faPlus} /> Add entry
        </button>
      )}
    </div>
  );
}
