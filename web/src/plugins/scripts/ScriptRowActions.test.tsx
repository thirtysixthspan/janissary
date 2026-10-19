import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ScriptRowActions } from './ScriptRowActions';

function renderActions(onAction = vi.fn()) {
  render(<ScriptRowActions name="deploy" onAction={onAction} />);
  return onAction;
}

describe('ScriptRowActions', () => {
  it.each([
    ['Run', 'run'],
    ['Duplicate', 'duplicate'],
    ['Delete', 'delete'],
  ])('calls onAction with the action of the %s button, named for the row', (label, action) => {
    const onAction = renderActions();

    fireEvent.click(screen.getByRole('button', { name: `${label} deploy` }));

    expect(onAction).toHaveBeenCalledWith(action);
    expect(onAction).toHaveBeenCalledOnce();
  });

  it('gives each button the tooltip Run, Duplicate, or Delete', () => {
    renderActions();

    expect(screen.getByRole('button', { name: 'Run deploy' })).toHaveAttribute('title', 'Run');
    expect(screen.getByRole('button', { name: 'Duplicate deploy' })).toHaveAttribute('title', 'Duplicate');
    expect(screen.getByRole('button', { name: 'Delete deploy' })).toHaveAttribute('title', 'Delete');
  });

  it('stops a button click from reaching the element around it', () => {
    const outer = vi.fn();
    render(
      <div onClick={outer}>
        <ScriptRowActions name="deploy" onAction={vi.fn()} />
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Run deploy' }));

    expect(outer).not.toHaveBeenCalled();
  });

  it.each([
    ['Run', 'run'],
    ['Duplicate', 'duplicate'],
  ])('calls onAction once for a double-click on the %s button', async (label, action) => {
    const user = userEvent.setup();
    const onAction = renderActions();

    await user.dblClick(screen.getByRole('button', { name: `${label} deploy` }));

    expect(onAction).toHaveBeenCalledOnce();
    expect(onAction).toHaveBeenCalledWith(action);
  });

  it.each(['Run', 'Duplicate', 'Delete'])('stops a double-click on the %s button from reaching the row around it', async (label) => {
    const user = userEvent.setup();
    const outer = vi.fn();
    render(
      <div onDoubleClick={outer}>
        <ScriptRowActions name="deploy" onAction={vi.fn()} />
      </div>,
    );

    await user.dblClick(screen.getByRole('button', { name: `${label} deploy` }));

    expect(outer).not.toHaveBeenCalled();
  });
});
