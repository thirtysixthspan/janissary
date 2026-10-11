import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faTrash } from '@fortawesome/free-solid-svg-icons';
import type { Role } from '@shared/plugins/roles/shared';
import type { TabPluginClientCapabilities } from '../api';
import {
  allowDrop, dragEnd, dragEntry, dragRole, dropOnEntry, dropOnRole,
} from './roles-dnd';

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
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description);
  const [picker, setPicker] = useState(false);
  const [pickHarness, setPickHarness] = useState(Object.keys(models)[0] ?? '');
  const [pickModel, setPickModel] = useState('');
  const [drop, setDrop] = useState(false);

  const raise = (intent: string, payload: Record<string, unknown>) => {
    onRefusal(null);
    void capabilities.intent(intent, payload).catch((error: unknown) => {
      onRefusal(String(error instanceof Error ? error.message : error));
    });
  };

  const commitName = () => {
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed === role.name) setName(role.name);
    else raise('rename-role', { name: role.name, next: trimmed });
  };

  const commitDescription = () => {
    if (description !== role.description) raise('describe-role', { name: role.name, description });
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
          value={name}
          aria-label={`Name of role ${role.name}`}
          onChange={(event) => setName(event.target.value)}
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            else if (event.key === 'Escape') setName(role.name);
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
        value={description}
        placeholder="Description"
        aria-label={`Description of role ${role.name}`}
        onChange={(event) => setDescription(event.target.value)}
        onBlur={commitDescription}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          else if (event.key === 'Escape') setDescription(role.description);
        }}
      />
      <ul className="roles-entries">
        {role.entries.map((entry, position) => (
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
        ))}
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
