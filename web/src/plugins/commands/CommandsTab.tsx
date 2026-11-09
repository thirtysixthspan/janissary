import { useRef, type KeyboardEvent } from 'react';
import type { CommandsPayload } from '@shared/plugins/commands/shared';
import type { TabPluginClientCapabilities } from '../api';
import { CommandRowView } from './CommandRow';
import { moveCommandFocus } from './commands-keys';
import { useCommands } from './useCommands';

export function CommandsTab({
  payload,
  capabilities,
}: {
  payload: CommandsPayload;
  capabilities: TabPluginClientCapabilities;
}) {
  const container = useRef<HTMLDivElement>(null);
  const { isPending, refusal, toggle } = useCommands(capabilities);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const row = Number(input.dataset.row);
    const column = input.dataset.column;
    if (!Number.isSafeInteger(row) || (column !== 'enabled' && column !== 'agentAccess')) return;
    const next = moveCommandFocus(payload.commands, { row, column }, event.key, isPending);
    event.preventDefault();
    event.stopPropagation();
    if (!next) return;
    const selector = `input[data-row="${next.row}"][data-column="${next.column}"]`;
    container.current?.querySelector<HTMLInputElement>(selector)?.focus();
  };

  return (
    <div className="commands-tab plugin-tab" data-doc-shot="commands-tab" ref={container} onKeyDown={onKeyDown}>
      <div className="commands-source">
        {payload.source === 'default' ? 'No commands file in effect' : `Editing ${payload.path}`}
      </div>
      {payload.overridden && payload.overridden.length > 0 ? (
        <div className="commands-problem commands-overridden">
          {`This project file lifts ${payload.overridden.length} home restriction${payload.overridden.length === 1 ? '' : 's'}: ${payload.overridden.join(', ')}.`}
        </div>
      ) : null}
      {payload.problem ? <div className="commands-problem">{payload.problem}</div> : null}
      {refusal ? <div className="commands-refusal" role="alert">{refusal}</div> : null}
      {payload.commands.length === 0 ? (
        <div className="commands-empty">No commands</div>
      ) : (
        <div className="commands-scroll">
          <div className="commands-grid">
            <div className="commands-columns" aria-hidden="true">
              <span>Command</span>
              <span>Enabled</span>
              <span>Agent access</span>
            </div>
            {payload.commands.map((row, index) => (
              <CommandRowView
                key={`${row.name}:${row.label}`}
                row={row}
                rows={payload.commands}
                index={index}
                enabledPending={isPending(row, 'enabled')}
                agentPending={isPending(row, 'agentAccess')}
                onToggle={toggle}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
