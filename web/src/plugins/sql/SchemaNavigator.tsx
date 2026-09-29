import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTable, faEye, faList, faBolt } from '@fortawesome/free-solid-svg-icons';
import type { SqlObject, SqlPayload } from '@shared/plugins/sql/shared';
import type { TabPluginClientCapabilities } from '../api';
import { browsable, columnCount, groupedObjects } from './grid-view';

const GROUP_ICON = {
  table: faTable,
  view: faEye,
  index: faList,
  trigger: faBolt,
} as const;

// The schema navigator: every object in the database, grouped, with the selected one highlighted.
// A trigger is listed because it is part of the schema, but it is not browsable and the row says so
// rather than silently doing nothing when pressed.
export function SchemaNavigator({
  payload, capabilities,
}: {
  payload: SqlPayload;
  capabilities: TabPluginClientCapabilities;
}) {
  const groups = groupedObjects(payload.objects);
  const select = (object: string) => {
    if (capabilities.active) void capabilities.intent('select-object', { object });
  };
  return (
    <div className="sql-nav" role="tree" aria-label="Schema">
      {groups.length === 0 ? (
        <div className="sql-nav-empty">No tables.</div>
      ) : groups.map((group) => (
        <div className="sql-nav-group" key={group.kind}>
          <div className="sql-nav-group-label">
            <FontAwesomeIcon icon={GROUP_ICON[group.kind]} />
            <span>{group.label}</span>
          </div>
          {group.entries.map((object) => (
            <ObjectRow
              key={object.name}
              object={object}
              selected={object.name === payload.object}
              onSelect={select}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function ObjectRow({
  object, selected, onSelect,
}: {
  object: SqlObject;
  selected: boolean;
  onSelect(object: string): void;
}) {
  const usable = browsable(object);
  return (
    <div
      className={`sql-nav-row${selected ? ' selected' : ''}${usable ? '' : ' inert'}`}
      role="treeitem"
      aria-selected={selected}
      aria-disabled={!usable}
      tabIndex={0}
      title={usable ? columnCount(object) : `${object.name} cannot be browsed`}
      onClick={() => usable && onSelect(object.name)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        if (usable) onSelect(object.name);
      }}
    >
      <span className="sql-nav-name">{object.name}</span>
      <span className="sql-nav-count">{usable ? columnCount(object) : '—'}</span>
    </div>
  );
}
