import React, { useCallback, useRef, useState } from 'react';
import type { HarnessLaunchView } from '@shared/protocol';
import { EFFORT_LEVELS } from '@shared/harness/effort-levels';
import { ModelSearchInput } from '../shared/model-search/ModelSearchInput';
import type { ModelSearchListState } from '../shared/model-search/useModelSearch';
import type { JanusClient } from '../shared/ws/ws';
import { useLaunchDialog } from '../shared/use-launch-dialog';
import type { HarnessLaunchFields } from './harness-launch-command';
import { autoApproveSupported, autoResumeSupported, initialFields, modelValid, nextFields } from './harness-launch-selection';
import { useHarnessLaunchActions } from './useHarnessLaunchActions';

type Properties = { view: HarnessLaunchView; client: JanusClient };

// Remembered across reopen within a single app run (module-level, never persisted to disk).
let remembered: HarnessLaunchFields | null = null;

// Test support: clear the remembered selections so cases start from defaults.
export function resetHarnessLaunchDialogMemory(): void {
  remembered = null;
}

// The "New harness" launch dialog (opened by typing bare `harness`). A small form over the delivered
// catalog: it enforces the flag constraints by disabling controls that would build an invalid
// command, so Create can only ever submit a valid `harness …` string via the normal command path.
export function HarnessLaunchDialog({ view, client }: Properties) {
  const [fields, setFields] = useState<HarnessLaunchFields>(() => {
    const initial = remembered ?? initialFields(view);
    return modelValid(view, initial.name, initial.model) ? initial : { ...initial, model: '' };
  });
  const [hadRemembered] = useState(() => remembered !== null);

  const models = view.models[fields.name] ?? [];
  const autoApproveEnabled = autoApproveSupported(view, fields.name);
  const autoApproveNames = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(view.autoApprove);
  const autoResumeEnabled = autoResumeSupported(view, fields.name);
  const autoResumeNames = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(view.autoResume);

  const listState = useRef<ModelSearchListState>({ open: false, highlighted: false });
  const onListChange = useCallback((state: ModelSearchListState) => { listState.current = state; }, []);
  const yieldsKey = useCallback((event: KeyboardEvent) => {
    const state = listState.current;
    return state.open && (event.key === 'Escape' || (event.key === 'Enter' && state.highlighted));
  }, []);

  const update = useCallback((patch: Partial<HarnessLaunchFields>) => {
    setFields((prev) => {
      const next = nextFields(prev, patch, view);
      remembered = modelValid(view, next.name, next.model) ? next : { ...next, model: '' };
      return next;
    });
  }, [view]);

  const modelText = fields.model.trim();
  const canCreate = modelValid(view, fields.name, modelText);

  const { cancel, create } = useHarnessLaunchActions(client, { ...fields, model: modelText });
  const { dialogRef, submitButtonRef } = useLaunchDialog(cancel, create, canCreate, hadRemembered, yieldsKey);

  return (
    <div className="modal-backdrop">
      <div ref={dialogRef} className="modal harness-launch" role="dialog" aria-modal="true" tabIndex={-1} data-doc-shot="harness-launch-dialog">
        <div className="modal-title">New harness</div>
        <div className="harness-launch-form">
          <label>Harness
            <select value={fields.name} onChange={(e) => update({ name: e.target.value })}>
              {view.names.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label>Label
            <input type="text" value={fields.label} placeholder="(optional)" onChange={(e) => update({ label: e.target.value })} />
          </label>
          <label className="harness-launch-check">
            <input type="checkbox" checked={fields.workspace} onChange={(e) => update({ workspace: e.target.checked })} />
            Workspace (-w)
          </label>
          <label className="harness-launch-check">
            <input type="checkbox" checked={fields.offline} onChange={(e) => update({ offline: e.target.checked })} />
            Offline (--offline)
          </label>
          <label className="harness-launch-check">
            <input type="checkbox" checked={fields.browser} onChange={(e) => update({ browser: e.target.checked })} />
            E2E browser (-b)
          </label>
          <label className={`harness-launch-check${autoApproveEnabled ? '' : ' disabled'}`}>
            <input
              type="checkbox"
              checked={fields.autoApprove}
              disabled={!autoApproveEnabled}
              onChange={(e) => update({ autoApprove: e.target.checked })}
            />
            Auto-approve (-y) — {autoApproveNames} only
          </label>
          <label className={`harness-launch-check${autoResumeEnabled ? '' : ' disabled'}`}>
            <input
              type="checkbox"
              checked={fields.autoResume}
              disabled={!autoResumeEnabled}
              onChange={(e) => update({ autoResume: e.target.checked })}
            />
            Auto-resume (--auto-resume) — {autoResumeNames} only
          </label>
          <label>Model
            <ModelSearchInput
              ids={models}
              roleEntries={view.roleEntries}
              harness={fields.name}
              value={fields.model}
              onChange={(model) => update({ model })}
              placeholder="(default)"
              aria-label="Model"
              disabled={models.length === 0}
              onListChange={onListChange}
            />
          </label>
          <label>Effort
            <select value={fields.effort} onChange={(e) => update({ effort: e.target.value })}>
              <option value="">(default)</option>
              {EFFORT_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
            </select>
          </label>
        </div>
        <div className="modal-actions">
          <button ref={submitButtonRef} className="modal-button" disabled={!canCreate} onClick={create}>Create</button>
          <button className="modal-button" onClick={cancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
