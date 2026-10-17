import React, { useCallback, useState } from 'react';
import type { ScheduleLaunchView } from '@shared/protocol';
import type { JanusClient } from '../shared/ws/ws';
import { useLaunchDialog } from '../shared/use-launch-dialog';
import type { ScheduleFields, ScheduleTarget, ScheduleType } from './schedule-command';
import { initialScheduleTarget, reconcileScheduleFields } from './schedule-selection';
import { useScheduleLaunchActions } from './useScheduleLaunchActions';

type Properties = { view: ScheduleLaunchView; client: JanusClient };

const SCHEDULE_TYPES: { value: ScheduleType; label: string }[] = [
  { value: 'at', label: 'At a time (today/next day)' },
  { value: 'on', label: 'On a date' },
  { value: 'every', label: 'Every interval' },
  { value: 'everyDay', label: 'Every day at a time' },
  { value: 'everyWeekday', label: 'Every weekday at a time' },
];

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function initialFields(view: ScheduleLaunchView): ScheduleFields {
  return {
    name: '', target: initialScheduleTarget(view), activeTarget: view.active, command: '', script: '',
    type: 'at', time: '', date: '', interval: '', weekday: 'monday',
  };
}

// Remembered across reopen within a single app run (module-level, never persisted to disk).
let remembered: ScheduleFields | null = null;

// Test support: clear the remembered selections so cases start from defaults.
export function resetScheduleDialogMemory(): void {
  remembered = null;
}

// The "New schedule" dialog (opened by typing bare `schedule`). A small form over the five
// schedule forms: it assembles the equivalent `schedule …` string and submits it through the
// normal command path, so the server's existing parsing/validation/firing runs unchanged.
export function ScheduleDialog({ view, client }: Properties) {
  const [storedFields, setFields] = useState<ScheduleFields>(() => remembered ?? initialFields(view));
  const fields = reconcileScheduleFields(storedFields, view);
  const [hadRemembered] = useState(() => remembered !== null);

  const update = useCallback((patch: Partial<ScheduleFields>) => {
    setFields((prev) => {
      const next = reconcileScheduleFields({ ...prev, ...patch }, view);
      remembered = next;
      return next;
    });
  }, [view]);

  const selectTarget = (value: string): ScheduleTarget => value === 'system'
    ? { kind: 'system' }
    : { kind: 'tab', label: value.slice('tab:'.length) };

  const { cancel, create, canSubmit } = useScheduleLaunchActions(client, fields);
  const { dialogRef, submitButtonRef } = useLaunchDialog(cancel, create, canSubmit, hadRemembered);

  return (
    <div className="modal-backdrop">
      <div ref={dialogRef} className="modal schedule-launch" role="dialog" aria-modal="true" tabIndex={-1}>
        <div className="modal-title">New schedule</div>
        <div className="schedule-launch-form">
          <label>Name
            <input type="text" value={fields.name} onChange={(e) => update({ name: e.target.value })} />
          </label>
          <label>Schedule target
            <select
              value={fields.target.kind === 'system' ? 'system' : `tab:${fields.target.label}`}
              onChange={(e) => update({ target: selectTarget(e.target.value) })}
            >
              <option value="system">Project (system)</option>
              {view.targets.map((label) => <option key={label} value={`tab:${label}`}>{label}</option>)}
            </select>
          </label>
          <label>Schedule type
            <select value={fields.type} onChange={(e) => update({ type: e.target.value as ScheduleType })}>
              {SCHEDULE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          {fields.type === 'on' && (
            <label>Date
              <input type="text" value={fields.date} placeholder="aug 12" onChange={(e) => update({ date: e.target.value })} />
            </label>
          )}
          {fields.type === 'every' && (
            <label>Interval
              <input type="text" value={fields.interval} placeholder="5m" onChange={(e) => update({ interval: e.target.value })} />
            </label>
          )}
          {fields.type === 'everyWeekday' && (
            <label>Weekday
              <select value={fields.weekday} onChange={(e) => update({ weekday: e.target.value })}>
                {WEEKDAYS.map((day) => <option key={day} value={day}>{day}</option>)}
              </select>
            </label>
          )}
          {fields.type !== 'every' && (
            <label>Time {fields.type === 'on' ? '(optional)' : ''}
              <input type="text" value={fields.time} placeholder="3pm" onChange={(e) => update({ time: e.target.value })} />
            </label>
          )}
          {fields.target.kind === 'system' ? (
            <label>Runscript
              <select
                aria-describedby={view.runscripts.length === 0 ? 'schedule-runscript-empty' : undefined}
                value={fields.script}
                disabled={view.runscripts.length === 0}
                onChange={(e) => update({ script: e.target.value })}
              >
                <option value="">Choose a runscript</option>
                {view.runscripts.map((script) => <option key={script} value={script}>{script}</option>)}
              </select>
              {view.runscripts.length === 0 && (
                <span id="schedule-runscript-empty" role="status">
                  No valid runscripts. Add a valid .rs file under .janissary/scripts/.
                </span>
              )}
            </label>
          ) : (
            <label>Command
              <input type="text" value={fields.command} onChange={(e) => update({ command: e.target.value })} />
            </label>
          )}
        </div>
        <div className="modal-actions">
          <button ref={submitButtonRef} className="modal-button" disabled={!canSubmit} onClick={create}>Schedule</button>
          <button className="modal-button" onClick={cancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
