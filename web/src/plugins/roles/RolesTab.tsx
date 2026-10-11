import React, { useState } from 'react';
import type { RolesPayload } from '@shared/plugins/roles/shared';
import type { TabPluginClientCapabilities } from '../api';
import { RoleCard } from './RoleCard';
import { allowDrop, dragCatalogModel, dragEnd, dropOnCatalog } from './roles-dnd';

type Properties = { payload: RolesPayload; capabilities: TabPluginClientCapabilities };

// The roles tab: the harness model catalog on the left, the roles on the right. A model dragged
// from the catalog onto a role card becomes that role's next entry; an entry dragged back onto the
// catalog leaves its role. The names, descriptions, efforts, and order are edited in place, and
// every edit is one intent — the server writes the file and republishes, so nothing shown here is
// local state the file does not hold.
export function RolesTab({ payload, capabilities }: Properties) {
  const { roles, source, path, problem, catalog } = payload;
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [refusal, setRefusal] = useState<string | null>(null);

  const raise = (intent: string, value: Record<string, unknown>) => {
    setRefusal(null);
    void capabilities.intent(intent, value).catch((error: unknown) => {
      setRefusal(String(error instanceof Error ? error.message : error));
    });
  };

  const commitNewRole = () => {
    const trimmed = newName.trim();
    setNewName('');
    setAdding(false);
    if (trimmed.length > 0) raise('add-role', { name: trimmed });
  };

  return (
    <div className="roles-tab">
      <div
        className="roles-catalog"
        onDragOver={(event) => allowDrop(event, (drag) => drag.kind === 'entry')}
        onDrop={(event) => {
          const result = dropOnCatalog(event);
          if (result) raise(result.intent, result.payload);
        }}
      >
        <div className="roles-column-title">Models</div>
        {Object.entries(catalog.models).map(([harness, models]) => (
          <div key={harness} className="roles-catalog-group">
            <div className="roles-catalog-harness">{harness}</div>
            <ul>
              {models.map((model) => (
                <li
                  key={model}
                  draggable
                  onDragStart={(event) => dragCatalogModel(event, harness, model)}
                  onDragEnd={dragEnd}
                  title="Drag onto a role"
                >
                  {model}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="roles-list">
        <div className="roles-source">
          {source === 'default' ? 'No roles file in effect' : `Editing ${path}`}
        </div>
        {problem ? <div className="roles-problem">{problem}</div> : null}
        {refusal ? <div className="roles-refusal">{refusal}</div> : null}
        {roles.length === 0 && !adding ? <div className="roles-empty">No roles yet.</div> : null}
        {roles.map((role, index) => (
          <RoleCard
            key={role.name}
            role={role}
            index={index}
            efforts={catalog.efforts}
            models={catalog.models}
            capabilities={capabilities}
            onRefusal={setRefusal}
          />
        ))}
        {adding ? (
          <div className="roles-card roles-new">
            <input
              autoFocus
              value={newName}
              placeholder="Role name"
              aria-label="New role name"
              onChange={(event) => setNewName(event.target.value)}
              onBlur={commitNewRole}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
                else if (event.key === 'Escape') {
                  setNewName('');
                  setAdding(false);
                }
              }}
            />
          </div>
        ) : (
          <button type="button" className="roles-add-role" onClick={() => setAdding(true)}>
            Add role
          </button>
        )}
      </div>
    </div>
  );
}
