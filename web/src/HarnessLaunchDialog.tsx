import React, { useCallback, useState } from 'react';
import type { HarnessLaunchView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { useLaunchDialog } from './use-launch-dialog';
import { buildHarnessLaunchCommand, type HarnessLaunchFields } from './harness-launch-command';

type Properties = { view: HarnessLaunchView; client: JanusClient };

function initialFields(names: string[]): HarnessLaunchFields {
  return { name: names[0] ?? 'claude', label: '', workspace: false, offline: false, autoApprove: false, model: '', effort: '' };
}

const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'];

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
  const [fields, setFields] = useState<HarnessLaunchFields>(() => remembered ?? initialFields(view.names));
  const [hadRemembered] = useState(() => remembered !== null);

  const models = view.models[fields.name] ?? [];
  const autoApproveEnabled = fields.name === 'claude' && fields.workspace;

  const update = useCallback((patch: Partial<HarnessLaunchFields>) => {
    setFields((prev) => {
      const next = { ...prev, ...patch };
      if (!(view.models[next.name] ?? []).includes(next.model)) next.model = '';
      if (!(next.name === 'claude' && next.workspace)) next.autoApprove = false;
      remembered = next;
      return next;
    });
  }, [view]);

  const { dialogRef, submitButtonRef, cancel, create } = useLaunchDialog(
    client, 'closeHarnessLaunch', fields, buildHarnessLaunchCommand, hadRemembered,
  );

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
          <label className={`harness-launch-check${autoApproveEnabled ? '' : ' disabled'}`}>
            <input
              type="checkbox"
              checked={fields.autoApprove}
              disabled={!autoApproveEnabled}
              onChange={(e) => update({ autoApprove: e.target.checked })}
            />
            Auto-approve (-y) — claude + workspace only
          </label>
          <label>Model
            <select value={fields.model} disabled={models.length === 0} onChange={(e) => update({ model: e.target.value })}>
              <option value="">(default)</option>
              {models.map((model) => <option key={model} value={model}>{model}</option>)}
            </select>
          </label>
          <label>Effort
            <select value={fields.effort} onChange={(e) => update({ effort: e.target.value })}>
              <option value="">(default)</option>
              {EFFORT_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
            </select>
          </label>
        </div>
        <div className="modal-actions">
          <button ref={submitButtonRef} className="modal-button" onClick={create}>Create</button>
          <button className="modal-button" onClick={cancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
