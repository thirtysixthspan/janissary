import React, { useRef, useState } from 'react';
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
  // What an awaited answer needs to read once the component has moved on: the name in the field now,
  // and the one whose `add-role` answer has not arrived. Enter blurs the field, so the same draft can
  // reach the handler twice; the guard is keyed by name rather than by a blanket busy flag so a
  // second, different name typed meanwhile is still its own submission.
  const typed = useRef('');
  const inFlight = useRef<string | null>(null);

  const raise = (intent: string, value: Record<string, unknown>) => {
    setRefusal(null);
    void capabilities.intent(intent, value).catch((error: unknown) => {
      setRefusal(String(error instanceof Error ? error.message : error));
    });
  };

  const typeName = (next: string) => {
    typed.current = next;
    setNewName(next);
  };

  const closeNewRole = () => {
    typed.current = '';
    setNewName('');
    setAdding(false);
  };

  // The creation field closes only once the name is accepted. A refused name stays editable so it can
  // be corrected, and a name typed while the answer is still coming is left alone rather than wiped
  // by a success belonging to an earlier submission.
  const commitNewRole = async () => {
    const trimmed = newName.trim();
    if (trimmed.length === 0) {
      closeNewRole();
      return;
    }
    if (inFlight.current === trimmed) return;
    inFlight.current = trimmed;
    setRefusal(null);
    try {
      await capabilities.intent('add-role', { name: trimmed });
      if (typed.current.trim() !== trimmed) return;
      closeNewRole();
    } catch (error) {
      setRefusal(String(error instanceof Error ? error.message : error));
    } finally {
      if (inFlight.current === trimmed) inFlight.current = null;
    }
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
              onChange={(event) => typeName(event.target.value)}
              onBlur={() => void commitNewRole()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
                else if (event.key === 'Escape') closeNewRole();
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
