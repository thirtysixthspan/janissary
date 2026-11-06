import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ConnectionView, ScheduleView } from '@shared/protocol';
import { StatusPanels } from './StatusPanels';
import type { StatusWindowHandlers } from './useStatusWindows';

function windowState(overrides: Partial<StatusWindowHandlers> = {}): StatusWindowHandlers {
  return {
    visible: true,
    opacity: 1,
    onButtonEnter: () => {},
    onButtonLeave: () => {},
    onButtonClick: () => {},
    onWindowEnter: () => {},
    onWindowLeave: () => {},
    ...overrides,
  };
}

type Rows = { connections?: ConnectionView[]; schedule?: ScheduleView[] };

// The two row lists are props rather than a tab, which is what lets a plugin holding only its own
// payload render the host's own panels — so these tests pass rows directly, the way that caller does.
function renderPanels(rows: Rows, windowOverrides: Partial<{
  connectionsWindow: StatusWindowHandlers;
  scheduleWindow: StatusWindowHandlers;
}> & {
  onCloseRow?: (row: ConnectionView, index: number) => void;
  canCloseRow?: (row: ConnectionView) => boolean;
  onOpenAcpTranscript?: (ref: NonNullable<ConnectionView['acpRef']>) => void;
  onOpenRow?: (row: ConnectionView) => void;
  interactive?: boolean;
  scheduleOnly?: boolean;
} = {}) {
  const {
    onCloseRow, canCloseRow, onOpenAcpTranscript, onOpenRow, interactive, scheduleOnly,
    connectionsWindow = windowState(), scheduleWindow = windowState(),
  } = windowOverrides;
  return render(
    <StatusPanels
      connections={rows.connections ?? []}
      schedule={rows.schedule ?? []}
      connectionsWindow={connectionsWindow}
      scheduleWindow={scheduleWindow}
      scheduleOnly={scheduleOnly}
      interactive={interactive}
      onCloseRow={onCloseRow}
      canCloseRow={canCloseRow}
      onOpenAcpTranscript={onOpenAcpTranscript}
      onOpenRow={onOpenRow}
    />,
  );
}

describe('StatusPanels', () => {
  it('renders an ssh connection row with a conn-ssh class when the window is visible', () => {
    const { container } = renderPanels({ connections: [{ text: 'ssh:devbox', kind: 'ssh' }] });
    const row = container.querySelector('.panel-row.conn-ssh');
    expect(row).toBeInTheDocument();
    expect(row?.textContent).toBe('ssh:devbox');
  });

  it('drops the connections list when scheduleOnly is set', () => {
    const { container } = renderPanels({
      connections: [{ text: 'ssh:devbox', kind: 'ssh' }],
      schedule: [{ id: 's1', spec: 'every 1h', next: 'in 1h', recurring: true }],
    }, { scheduleOnly: true });
    expect(container.querySelector('.panel-row.conn-ssh')).not.toBeInTheDocument();
    expect(container.querySelector('.panel-title')?.textContent).toBe('schedule');
  });

  it('renders a non-empty window only when the hook marks it visible', () => {
    const rows = { connections: [{ text: 'ssh:devbox', kind: 'ssh' as const }] };
    const { container, rerender } = render(
      <StatusPanels
        connections={rows.connections} schedule={[]}
        connectionsWindow={windowState({ visible: false })} scheduleWindow={windowState()}
      />,
    );
    expect(container.querySelector('.status-panels')).not.toBeInTheDocument();

    rerender(
      <StatusPanels
        connections={rows.connections} schedule={[]}
        connectionsWindow={windowState({ visible: true })} scheduleWindow={windowState()}
      />,
    );
    expect(container.querySelector('.status-panels')).toBeInTheDocument();
  });

  it('applies the fading opacity to the panel style', () => {
    const { container } = renderPanels(
      { connections: [{ text: 'ssh:devbox', kind: 'ssh' }] },
      { connectionsWindow: windowState({ opacity: 0 }) },
    );
    expect(container.querySelector('.panel')).toHaveStyle({ opacity: '0' });
  });

  it('still renders nothing for an empty window even when marked visible', () => {
    const { container } = renderPanels({});
    expect(container.querySelector('.status-panels')).not.toBeInTheDocument();
  });

  it('wires the window hover handlers only when interactive', () => {
    const onEnter = vi.fn();
    const onLeave = vi.fn();
    const { container } = renderPanels(
      { connections: [{ text: 'ssh:devbox', kind: 'ssh' }] },
      {
        interactive: true,
        connectionsWindow: windowState({ onWindowEnter: onEnter, onWindowLeave: onLeave }),
      },
    );
    const panel = container.querySelector('.panel');
    expect(panel).not.toBeNull();
    fireEvent.mouseEnter(panel!);
    expect(onEnter).toHaveBeenCalledTimes(1);
    fireEvent.mouseLeave(panel!);
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it('renders a close control on a row when onCloseRow is supplied and calls it with that row', () => {
    const onCloseRow = vi.fn();
    const { container } = renderPanels(
      { connections: [{ text: 'reviewer (acp)', kind: 'acp' }] },
      { onCloseRow },
    );
    const close = container.querySelector('.panel-row-close');
    expect(close).toBeInTheDocument();
    fireEvent.click(close!);
    expect(onCloseRow).toHaveBeenCalledWith({ text: 'reviewer (acp)', kind: 'acp' }, 0);
  });

  it('renders no close control when onCloseRow is omitted', () => {
    const { container } = renderPanels({ connections: [{ text: 'ssh:devbox', kind: 'ssh' }] });
    expect(container.querySelector('.panel-row-close')).not.toBeInTheDocument();
  });

  it('renders a close control only on rows the predicate accepts', () => {
    const onCloseRow = vi.fn();
    const persona = {
      text: 'reviewer (acp)', kind: 'acp' as const,
      acpRef: { scope: 'editor' as const, label: 'notes', persona: 'reviewer' },
    };
    const agent = { text: 'Agent: task.md', kind: 'acp' as const, recordId: 'record-1' };
    const { container } = renderPanels(
      { connections: [persona, agent] },
      { onCloseRow, canCloseRow: (row) => row.acpRef?.scope === 'editor' },
    );
    const closes = container.querySelectorAll('.panel-row-close');

    expect(closes).toHaveLength(1);
    fireEvent.click(closes[0]!);
    expect(onCloseRow).toHaveBeenCalledExactlyOnceWith(persona, 0);
  });

  it('renders the transcript button on a row with acpRef and calls onOpenAcpTranscript with it', () => {
    const onOpenAcpTranscript = vi.fn();
    const acpRef = { scope: 'tab' as const, label: 'janus', role: 'ask' as const };
    const { container } = renderPanels(
      { connections: [{ text: 'acp:opencode', kind: 'acp', acpRef }] },
      { onOpenAcpTranscript },
    );
    const button = container.querySelector('.panel-row-transcript');
    expect(button).toBeInTheDocument();
    fireEvent.click(button!);
    expect(onOpenAcpTranscript).toHaveBeenCalledWith(acpRef);
  });

  it('renders no transcript button on a row without acpRef', () => {
    const onOpenAcpTranscript = vi.fn();
    const { container } = renderPanels(
      { connections: [{ text: 'ssh:devbox', kind: 'ssh' }] },
      { onOpenAcpTranscript },
    );
    expect(container.querySelector('.panel-row-transcript')).not.toBeInTheDocument();
  });

  it('renders the close button and the transcript button together on an editor-persona row', () => {
    const onCloseRow = vi.fn();
    const onOpenAcpTranscript = vi.fn();
    const acpRef = { scope: 'editor' as const, label: 'notes', persona: 'reviewer' };
    const { container } = renderPanels(
      { connections: [{ text: 'reviewer (acp)', kind: 'acp', acpRef }] },
      { onCloseRow, onOpenAcpTranscript },
    );
    expect(container.querySelector('.panel-row-transcript')).toBeInTheDocument();
    expect(container.querySelector('.panel-row-close')).toBeInTheDocument();
  });

  it('opens a record-id row by pointer and keyboard', () => {
    const row: ConnectionView = { text: 'Agent: task.md', kind: 'acp', recordId: 'record-1' };
    const onOpenRow = vi.fn();
    const { container } = renderPanels({ connections: [row] }, { onOpenRow });
    const element = container.querySelector('.panel-row')!;

    expect(element).toHaveAttribute('role', 'button');
    expect(element).toHaveAttribute('tabindex', '0');
    fireEvent.click(element);
    fireEvent.keyDown(element, { key: 'Enter' });
    fireEvent.keyDown(element, { key: ' ' });

    expect(onOpenRow).toHaveBeenNthCalledWith(1, row);
    expect(onOpenRow).toHaveBeenNthCalledWith(2, row);
    expect(onOpenRow).toHaveBeenNthCalledWith(3, row);
    expect(container.querySelector('.panel-row-transcript')).toBeNull();
  });

  it('opens a tab-scoped ACP row by pointer and keyboard', () => {
    const row: ConnectionView = {
      text: 'acp:ask:opencode', kind: 'acp', acpRef: { scope: 'tab', label: 'janus', role: 'ask' },
    };
    const onOpenRow = vi.fn();
    const { container } = renderPanels({ connections: [row] }, { onOpenRow });
    const element = container.querySelector('.panel-row')!;

    fireEvent.click(element);
    fireEvent.keyDown(element, { key: 'Enter' });

    expect(onOpenRow).toHaveBeenNthCalledWith(1, row);
    expect(onOpenRow).toHaveBeenNthCalledWith(2, row);
  });

  it.each([
    ['monitor', { scope: 'monitor' as const, name: 'watch' }],
    ['editor', { scope: 'editor' as const, label: 'notes', persona: 'reviewer' }],
  ])('leaves a %s-scoped ACP row non-openable', (_scope, acpRef) => {
    const onOpenRow = vi.fn();
    const { container } = renderPanels(
      { connections: [{ text: 'row', kind: 'acp', acpRef }] },
      { onOpenRow },
    );
    const element = container.querySelector('.panel-row')!;

    expect(element).not.toHaveAttribute('role');
    expect(element).not.toHaveAttribute('tabindex');
    fireEvent.click(element);
    fireEvent.keyDown(element, { key: 'Enter' });

    expect(onOpenRow).not.toHaveBeenCalled();
  });

  it('does not open rows when the callback is omitted', () => {
    const { container } = renderPanels({
      connections: [{ text: 'Agent: task.md', kind: 'acp', recordId: 'record-1' }],
    });
    const element = container.querySelector('.panel-row')!;

    expect(element).not.toHaveAttribute('role');
    fireEvent.click(element);
  });

  it('keeps the snapshot button separate from row opening', () => {
    const acpRef = { scope: 'tab' as const, label: 'janus', role: 'ask' as const };
    const onOpenAcpTranscript = vi.fn();
    const onOpenRow = vi.fn();
    const { container } = renderPanels(
      { connections: [{ text: 'acp:opencode', kind: 'acp', acpRef }] },
      { onOpenAcpTranscript, onOpenRow },
    );
    const button = container.querySelector('.panel-row-transcript')!;

    fireEvent.click(button);
    fireEvent.keyDown(button, { key: 'Enter' });

    expect(onOpenAcpTranscript).toHaveBeenCalledExactlyOnceWith(acpRef);
    expect(onOpenRow).not.toHaveBeenCalled();
  });

  it('keeps the close button separate from row opening', () => {
    const onCloseRow = vi.fn();
    const onOpenRow = vi.fn();
    const { container } = renderPanels(
      { connections: [{ text: 'Agent: task.md', kind: 'acp', recordId: 'record-1' }] },
      { onCloseRow, onOpenRow },
    );

    fireEvent.click(container.querySelector('.panel-row-close')!);

    expect(onCloseRow).toHaveBeenCalledOnce();
    expect(onOpenRow).not.toHaveBeenCalled();
  });
});
