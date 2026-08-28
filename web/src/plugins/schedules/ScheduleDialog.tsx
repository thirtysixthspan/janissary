import React, { useCallback, useEffect, useRef, useState } from 'react';
import { buildScheduleCommand, type ScheduleFields, type ScheduleType } from './schedule-command';

type Properties = {
  targets: string[];
  activeTarget: string;
  onSubmit(text: string): void;
  onCancel(): void;
};

const SCHEDULE_TYPES: { value: ScheduleType; label: string }[] = [
  { value: 'at', label: 'At a time (today/next day)' },
  { value: 'on', label: 'On a date' },
  { value: 'every', label: 'Every interval' },
  { value: 'everyDay', label: 'Every day at a time' },
  { value: 'everyWeekday', label: 'Every weekday at a time' },
];

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function initialFields(active: string): ScheduleFields {
  return {
    name: '', target: active, activeTarget: active, command: '',
    type: 'at', time: '', date: '', interval: '', weekday: 'monday',
  };
}

// Remembered across reopen within a single app run (module-level, never persisted to disk).
let remembered: ScheduleFields | null = null;

// Test support: clear the remembered selections so cases start from defaults.
export function resetScheduleDialogMemory(): void {
  remembered = null;
}

function isValid(fields: ScheduleFields): boolean {
  if (!fields.name.trim() || !fields.command.trim()) return false;
  switch (fields.type) {
    case 'at': { return fields.time.trim() !== '';
    }
    case 'on': { return fields.date.trim() !== '';
    }
    case 'every': { return fields.interval.trim() !== '';
    }
    case 'everyDay': { return fields.time.trim() !== '';
    }
    case 'everyWeekday': { return fields.time.trim() !== '';
    }
  }
}

// The "New schedule" dialog (opened by typing bare `schedule`). A small form over the five
// schedule forms: it assembles the equivalent `schedule …` string and submits it through the
// normal command path, so the server's existing parsing/validation/firing runs unchanged.
export function ScheduleDialog({ targets, activeTarget, onSubmit, onCancel }: Properties) {
  const [fields, setFields] = useState<ScheduleFields>(() => remembered ?? initialFields(activeTarget));
  const [hadRemembered] = useState(() => remembered !== null);

  const update = useCallback((patch: Partial<ScheduleFields>) => {
    setFields((prev) => {
      const next = { ...prev, ...patch };
      remembered = next;
      return next;
    });
  }, []);

  const { dialogRef, submitButtonRef, create } = useScheduleDialogLifecycle(
    fields, hadRemembered, onSubmit, onCancel,
  );

  return (
    <div className="modal-backdrop">
      <div ref={dialogRef} className="modal schedule-launch" role="dialog" aria-modal="true" tabIndex={-1}>
        <div className="modal-title">New schedule</div>
        <div className="schedule-launch-form">
          <label>Name
            <input type="text" value={fields.name} onChange={(e) => update({ name: e.target.value })} />
          </label>
          <label>Target tab
            <select value={fields.target} onChange={(e) => update({ target: e.target.value })}>
              {targets.map((label) => <option key={label} value={label}>{label}</option>)}
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
          <label>Command
            <input type="text" value={fields.command} onChange={(e) => update({ command: e.target.value })} />
          </label>
        </div>
        <div className="modal-actions">
          <button ref={submitButtonRef} className="modal-button" disabled={!isValid(fields)} onClick={create}>Schedule</button>
          <button className="modal-button" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function useScheduleDialogLifecycle(
  fields: ScheduleFields,
  hadRemembered: boolean,
  onSubmit: (text: string) => void,
  onCancel: () => void,
) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const create = useCallback(() => {
    onSubmit(buildScheduleCommand(fields));
    onCancel();
  }, [fields, onSubmit, onCancel]);
  const onKeyDownRef = useRef<(event: KeyboardEvent) => void>(() => { /* replaced below */ });
  onKeyDownRef.current = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (isValid(fields)) create();
    }
  };

  useEffect(() => {
    dialogRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => onKeyDownRef.current(event);
    const handleOutsideClick = (event: MouseEvent) => {
      if (dialogRef.current?.contains(event.target as Node)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    globalThis.addEventListener('keydown', handleKeyDown, { capture: true });
    globalThis.addEventListener('click', handleOutsideClick, { capture: true });
    return () => {
      globalThis.removeEventListener('keydown', handleKeyDown, { capture: true });
      globalThis.removeEventListener('click', handleOutsideClick, { capture: true });
    };
  }, []);

  useEffect(() => {
    if (hadRemembered) submitButtonRef.current?.focus();
  }, [hadRemembered]);

  return { dialogRef, submitButtonRef, create };
}
