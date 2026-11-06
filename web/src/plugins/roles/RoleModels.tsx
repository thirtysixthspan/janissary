import React, { type RefObject } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faTrash } from '@fortawesome/free-solid-svg-icons';
import type { RoleEntry } from '@shared/plugins/roles/shared';
import { EntryPicker } from './EntryPicker';
import {
  allowDrop, dragEnd, dragEntry, dropOnEntry,
} from './roles-dnd';

export type EntryDrop = { intent: string; payload: Record<string, unknown> } | null;

export function RoleModels({
  roleName, entries, efforts, models, headingId, headingRef, picker,
  onAdd, onRemove, onSetEffort, onDropEntry,
}: {
  roleName: string;
  entries: RoleEntry[];
  efforts: readonly string[];
  models: Record<string, string[]>;
  headingId: string;
  headingRef: RefObject<HTMLHeadingElement | null>;
  picker: {
    open: boolean;
    openerRef: RefObject<HTMLButtonElement | null>;
    firstControlRef: RefObject<HTMLSelectElement | null>;
    openPicker(): void;
    closePicker(): void;
    onOpenerFocus(): void;
    onOpenerBlur(event: React.FocusEvent<HTMLButtonElement>): void;
  };
  onAdd(harness: string, model: string, effort: string): void;
  onRemove(position: number, expected: RoleEntry[]): void;
  onSetEffort(position: number, expected: RoleEntry[], effort: string | null): void;
  onDropEntry(result: EntryDrop): void;
}) {
  return (
    <section className="roles-section">
      <h3
        id={headingId}
        className="roles-section-heading"
        aria-label={`Models of role ${roleName}`}
        ref={headingRef}
        tabIndex={-1}
      >
        Models
      </h3>
      <ul className="roles-entries" aria-labelledby={headingId}>
        {entries.length === 0 ? <li className="roles-empty-row">No models</li> : null}
        {entries.map((entry, position) => {
          const stored = entry.effort !== undefined && !efforts.includes(entry.effort) ? entry.effort : null;
          return (
            <li
              key={`${entry.harness}:${entry.model}:${position}`}
              className={entry.missing === true ? 'roles-entry roles-entry-missing' : 'roles-entry'}
              title={entry.missing === true ? 'Not in the model catalog' : undefined}
              draggable
              onDragStart={(event) => dragEntry(event, roleName, position, entries)}
              onDragEnd={dragEnd}
              onDragOver={(event) => allowDrop(event, (drag) => drag.kind === 'entry')}
              onDrop={(event) => onDropEntry(dropOnEntry(event, roleName, position))}
            >
              <span className="roles-entry-model">{entry.model}</span>
              <span className="roles-entry-harness">{entry.harness}</span>
              <select
                className="roles-effort"
                value={entry.effort ?? ''}
                aria-label={`Effort for ${entry.model}`}
                onChange={(event) => onSetEffort(
                  position,
                  entries,
                  event.target.value === '' ? null : event.target.value,
                )}
              >
                <option value="">default</option>
                {stored === null ? null : <option value={stored}>{stored}</option>}
                {efforts.map((effort) => <option key={effort} value={effort}>{effort}</option>)}
              </select>
              <button
                type="button"
                className="roles-icon"
                title={`Remove ${entry.model}`}
                onClick={() => onRemove(position, entries)}
              >
                <FontAwesomeIcon icon={faTrash} />
              </button>
            </li>
          );
        })}
      </ul>
      {picker.open ? (
        <EntryPicker
          harnesses={Object.keys(models)}
          models={models}
          efforts={efforts}
          firstControlRef={picker.firstControlRef}
          onAdd={onAdd}
          onCancel={picker.closePicker}
        />
      ) : (
        <button
          ref={picker.openerRef}
          type="button"
          className="roles-add-model"
          onFocus={picker.onOpenerFocus}
          onBlur={picker.onOpenerBlur}
          onClick={picker.openPicker}
        >
          <FontAwesomeIcon icon={faPlus} /> Add model
        </button>
      )}
    </section>
  );
}
