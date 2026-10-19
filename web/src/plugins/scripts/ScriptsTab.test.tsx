import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunscriptRow } from '@shared/plugins/scripts/shared';
import type { TabPluginClientCapabilities } from '../api';
import { ScriptsTab } from './ScriptsTab';

function row(name: string, schedules = 0): RunscriptRow {
  return { name, schedules, open: false };
}

function makeCapabilities(onSplit?: () => void) {
  const intent = vi.fn<(name: string, payload: unknown) => Promise<unknown>>(async () => null);
  const capabilities: TabPluginClientCapabilities = {
    resourceUrl: (reference) => reference,
    intent: async <Result,>(name: string, payload: unknown) =>
      intent(name, payload) as Promise<Result>,
    copyText: vi.fn(),
    splitAction: onSplit ? <button type="button" className="tab-split" onClick={onSplit}>Split</button> : null,
    active: true,
    dock: null,
    close: vi.fn(),
    reportFailure: vi.fn(),
  };
  return { capabilities, intent };
}

function renderTab(rows: RunscriptRow[], onSplit?: () => void) {
  const { capabilities, intent } = makeCapabilities(onSplit);
  const rendered = render(<ScriptsTab payload={{ rows }} capabilities={capabilities} />);
  const rerenderWith = (next: RunscriptRow[]) => rendered.rerender(
    <ScriptsTab payload={{ rows: next }} capabilities={capabilities} />,
  );
  return { ...rendered, intent, rerenderWith };
}

function listedNames(container: HTMLElement) {
  return [...container.querySelectorAll(':scope .scripts-row .scripts-name')].map((element) => element.textContent);
}

function selectedName(container: HTMLElement) {
  return container.querySelector(':scope .scripts-row.selected .scripts-name')?.textContent ?? null;
}

function rowElement(name: string) {
  return screen.getByText(name).closest('.scripts-row')!;
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe('ScriptsTab rows', () => {
  it('renders the rows in the order the payload gives, with their names', () => {
    const { container } = renderTab([row('zeta'), row('alpha'), row('mid')]);

    expect(listedNames(container)).toEqual(['zeta', 'alpha', 'mid']);
  });

  it('shows the empty state with the plus button and no list', () => {
    const { container } = renderTab([]);

    expect(screen.getByText('No runscripts yet. Press + to create one.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New script' })).toBeInTheDocument();
    expect(container.querySelector('.scripts-row')).toBeNull();
  });

  it('shows the clock on a row used by a system schedule, and not on an unused one', () => {
    const { container } = renderTab([row('backup', 2), row('lint', 0)]);
    const [backup, lint] = container.querySelectorAll('.scripts-row');

    expect(screen.getByTitle('Used by a system schedule')).toBeInTheDocument();
    expect(backup).toContainElement(screen.getByTitle('Used by a system schedule'));
    expect(lint!.querySelector('.scripts-clock')).toBeNull();
  });
});

describe('ScriptsTab new script button', () => {
  it('labels the plus button New script, and a click sends create with an empty payload', () => {
    const { intent } = renderTab([row('backup')]);

    fireEvent.click(screen.getByRole('button', { name: 'New script' }));

    expect(intent).toHaveBeenCalledWith('create', {});
  });

  it('renders the host split action in the metadata row beside the plus button', () => {
    const onSplit = vi.fn();
    const { container } = renderTab([row('backup')], onSplit);

    fireEvent.click(screen.getByRole('button', { name: 'Split' }));

    expect(onSplit).toHaveBeenCalled();
    expect(container.querySelector('.plugin-actions')).toContainElement(
      screen.getByRole('button', { name: 'New script' }),
    );
  });

  it('creates one runscript when New script is double-clicked, ignoring the second click', () => {
    const { intent } = renderTab([row('backup')]);
    const button = screen.getByRole('button', { name: 'New script' });

    fireEvent.click(button, { detail: 1 });
    fireEvent.click(button, { detail: 2 });

    expect(intent).toHaveBeenCalledTimes(1);
    expect(intent).toHaveBeenCalledWith('create', {});
  });
});

describe('ScriptsTab selection and open', () => {
  it('selects a row on a single click and sends nothing', () => {
    const { container, intent } = renderTab([row('a'), row('b')]);

    fireEvent.click(screen.getByText('b'));

    expect(selectedName(container)).toBe('b');
    expect(intent).not.toHaveBeenCalled();
  });

  it('sends open with the row name on a double click', () => {
    const { intent } = renderTab([row('a'), row('b')]);

    fireEvent.doubleClick(screen.getByText('b'));

    expect(intent).toHaveBeenCalledWith('open', { name: 'b' });
  });

  it('sends open with the selected row name on Enter', () => {
    const { container, intent } = renderTab([row('a'), row('b')]);

    fireEvent.click(screen.getByText('b'));
    fireEvent.keyDown(container.querySelector('.scripts-tab')!, { key: 'Enter' });

    expect(intent).toHaveBeenCalledWith('open', { name: 'b' });
  });

  it('sends nothing on Enter with no selection', () => {
    const { container, intent } = renderTab([row('a'), row('b')]);

    fireEvent.keyDown(container.querySelector('.scripts-tab')!, { key: 'Enter' });

    expect(intent).not.toHaveBeenCalled();
  });

  it('sends nothing on Enter when a rerender removed the selected name', () => {
    const { container, intent, rerenderWith } = renderTab([row('a'), row('b')]);

    fireEvent.click(screen.getByText('b'));
    rerenderWith([row('a')]);
    fireEvent.keyDown(container.querySelector('.scripts-tab')!, { key: 'Enter' });

    expect(intent).not.toHaveBeenCalled();
  });

  it('leaves Enter on the focused plus button to the button, so it sends create and not open', async () => {
    const user = userEvent.setup();
    const { intent } = renderTab([row('a'), row('b')]);

    fireEvent.click(screen.getByText('b'));
    screen.getByRole('button', { name: 'New script' }).focus();
    await user.keyboard('{Enter}');

    expect(intent).toHaveBeenCalledWith('create', {});
    expect(intent).not.toHaveBeenCalledWith('open', expect.anything());
  });

  it('sends open with the row name on Enter pressed on that row', () => {
    const { intent } = renderTab([row('a'), row('b')]);

    fireEvent.click(screen.getByText('b'));
    fireEvent.keyDown(rowElement('b'), { key: 'Enter' });

    expect(intent).toHaveBeenCalledWith('open', { name: 'b' });
  });
});

describe('ScriptsTab keyboard movement', () => {
  it('moves the selection one row at a time with ArrowDown and ArrowUp, stopping at both ends', () => {
    const { container } = renderTab([row('a'), row('b'), row('c')]);
    const list = container.querySelector('.scripts-tab')!;

    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(selectedName(container)).toBe('b');
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(selectedName(container)).toBe('c');
    fireEvent.keyDown(list, { key: 'ArrowUp' });
    expect(selectedName(container)).toBe('b');
    fireEvent.keyDown(list, { key: 'ArrowUp' });
    fireEvent.keyDown(list, { key: 'ArrowUp' });
    expect(selectedName(container)).toBe('a');
  });

  it('selects the second row on the first ArrowDown when nothing is selected', () => {
    const { container } = renderTab([row('a'), row('b'), row('c')]);

    fireEvent.keyDown(container.querySelector('.scripts-tab')!, { key: 'ArrowDown' });

    expect(selectedName(container)).toBe('b');
  });

  it('jumps to the first and last rows with Home and End', () => {
    const { container } = renderTab([row('a'), row('b'), row('c')]);
    const list = container.querySelector('.scripts-tab')!;

    fireEvent.keyDown(list, { key: 'End' });
    expect(selectedName(container)).toBe('c');
    fireEvent.keyDown(list, { key: 'Home' });
    expect(selectedName(container)).toBe('a');
  });

  it('sends nothing and leaves the selection empty on Delete and Backspace with no selection, without preventing their default', () => {
    const { container, intent } = renderTab([row('a'), row('b')]);
    const list = container.querySelector('.scripts-tab')!;

    expect(fireEvent.keyDown(list, { key: 'Delete' })).toBe(true);
    expect(fireEvent.keyDown(list, { key: 'Backspace' })).toBe(true);
    expect(intent).not.toHaveBeenCalled();
    expect(selectedName(container)).toBeNull();
  });

  it('moves the selection with ArrowDown pressed on a row', () => {
    const { container } = renderTab([row('a'), row('b'), row('c')]);

    fireEvent.click(screen.getByText('a'));
    fireEvent.keyDown(rowElement('a'), { key: 'ArrowDown' });

    expect(selectedName(container)).toBe('b');
  });

  it('leaves the selection in place on arrow, Home, and End keys pressed on the focused New script button', () => {
    const { container } = renderTab([row('a'), row('b'), row('c')]);
    const button = screen.getByRole('button', { name: 'New script' });

    fireEvent.click(screen.getByText('b'));
    button.focus();

    expect(fireEvent.keyDown(button, { key: 'ArrowDown' })).toBe(true);
    expect(selectedName(container)).toBe('b');
    expect(fireEvent.keyDown(button, { key: 'ArrowUp' })).toBe(true);
    expect(selectedName(container)).toBe('b');
    expect(fireEvent.keyDown(button, { key: 'Home' })).toBe(true);
    expect(selectedName(container)).toBe('b');
    expect(fireEvent.keyDown(button, { key: 'End' })).toBe(true);
    expect(selectedName(container)).toBe('b');
  });
});

describe('ScriptsTab selection across rerenders', () => {
  it('keeps the highlight on the same name when a row is inserted above it', () => {
    const { container, rerenderWith } = renderTab([row('a'), row('b')]);

    fireEvent.click(screen.getByText('b'));
    rerenderWith([row('0'), row('a'), row('b')]);

    expect(selectedName(container)).toBe('b');
  });

  it('highlights nothing when the selected name is removed, and highlights it again when the name returns', () => {
    const { container, rerenderWith } = renderTab([row('a'), row('b')]);

    fireEvent.click(screen.getByText('b'));
    rerenderWith([row('a')]);
    expect(container.querySelector('.scripts-row.selected')).toBeNull();

    rerenderWith([row('a'), row('b')]);
    expect(selectedName(container)).toBe('b');
  });
});

function dialogButton(label: string) {
  return within(screen.getByRole('alertdialog')).getByRole('button', { name: label });
}

describe('ScriptsTab delete dialog', () => {
  it.each(['Delete', 'Backspace'])('opens the dialog for the selected row on %s and sends nothing', (key) => {
    const { container, intent } = renderTab([row('a'), row('b')]);

    fireEvent.click(screen.getByText('b'));

    expect(fireEvent.keyDown(container.querySelector('.scripts-tab')!, { key })).toBe(false);
    expect(screen.getByText('Delete runscript "b"?')).toBeInTheDocument();
    expect(intent).not.toHaveBeenCalled();
  });

  it('sends delete with the row name when the delete is confirmed', () => {
    const { container, intent } = renderTab([row('a'), row('b')]);

    fireEvent.click(screen.getByText('b'));
    fireEvent.keyDown(container.querySelector('.scripts-tab')!, { key: 'Delete' });
    fireEvent.click(dialogButton('Delete'));

    expect(intent).toHaveBeenCalledWith('delete', { name: 'b' });
  });

  it('shows the schedule line for a row a system schedule uses', () => {
    const { container } = renderTab([row('a'), row('b', 2)]);

    fireEvent.click(screen.getByText('b'));
    fireEvent.keyDown(container.querySelector('.scripts-tab')!, { key: 'Delete' });

    expect(screen.getByText('Used by 2 system schedules. They will fire as missing after this.')).toBeInTheDocument();
  });

  it('moves the selection to the next row after a confirmed delete of a selected row in the middle', () => {
    const { container } = renderTab([row('a'), row('b'), row('c')]);

    fireEvent.click(screen.getByText('b'));
    fireEvent.keyDown(container.querySelector('.scripts-tab')!, { key: 'Delete' });
    fireEvent.click(dialogButton('Delete'));

    expect(selectedName(container)).toBe('c');
  });

  it('moves the selection to the previous row after a confirmed delete of the last row', () => {
    const { container } = renderTab([row('a'), row('b'), row('c')]);

    fireEvent.click(screen.getByText('c'));
    fireEvent.keyDown(container.querySelector('.scripts-tab')!, { key: 'Delete' });
    fireEvent.click(dialogButton('Delete'));

    expect(selectedName(container)).toBe('b');
  });

  it('selects nothing after a confirmed delete of the only row', () => {
    const { container } = renderTab([row('a')]);

    fireEvent.click(screen.getByText('a'));
    fireEvent.keyDown(container.querySelector('.scripts-tab')!, { key: 'Delete' });
    fireEvent.click(dialogButton('Delete'));

    expect(selectedName(container)).toBeNull();
  });

  it('leaves the selection where it was after a confirmed delete of a row that is not selected', () => {
    const { container, intent } = renderTab([row('a'), row('b'), row('c')]);

    fireEvent.click(screen.getByText('a'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete c' }));
    fireEvent.click(dialogButton('Delete'));

    expect(intent).toHaveBeenCalledWith('delete', { name: 'c' });
    expect(selectedName(container)).toBe('a');
  });

  it('keeps the highlight on the next name after a rerender drops the deleted row', () => {
    const { container, rerenderWith } = renderTab([row('a'), row('b'), row('c')]);

    fireEvent.click(screen.getByText('b'));
    fireEvent.keyDown(container.querySelector('.scripts-tab')!, { key: 'Delete' });
    fireEvent.click(dialogButton('Delete'));
    rerenderWith([row('a'), row('c')]);

    expect(selectedName(container)).toBe('c');
  });

  it('returns focus to the tab after a confirm', () => {
    const { container } = renderTab([row('a'), row('b')]);

    fireEvent.click(screen.getByText('b'));
    fireEvent.keyDown(container.querySelector('.scripts-tab')!, { key: 'Delete' });
    fireEvent.click(dialogButton('Delete'));

    expect(document.activeElement).toBe(container.querySelector('.scripts-tab'));
  });

  it('closes without sending and returns focus to the tab after a cancel, keeping the selection', () => {
    const { container, intent } = renderTab([row('a'), row('b')]);

    fireEvent.click(screen.getByText('b'));
    fireEvent.keyDown(container.querySelector('.scripts-tab')!, { key: 'Delete' });
    fireEvent.click(dialogButton('Cancel'));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(intent).not.toHaveBeenCalled();
    expect(selectedName(container)).toBe('b');
    expect(document.activeElement).toBe(container.querySelector('.scripts-tab'));
  });
});

describe('ScriptsTab row buttons', () => {
  it.each([
    ['Run', 'execute'],
    ['Duplicate', 'clone'],
  ])('sends %s as %s with the row name, keeps the selection, and returns focus to the tab', (label, name) => {
    const { container, intent } = renderTab([row('a'), row('b')]);

    fireEvent.click(screen.getByText('a'));
    fireEvent.click(screen.getByRole('button', { name: `${label} b` }));

    expect(intent).toHaveBeenCalledWith(name, { name: 'b' });
    expect(selectedName(container)).toBe('a');
    expect(document.activeElement).toBe(container.querySelector('.scripts-tab'));
  });

  it('opens the dialog for its own row on a click of Delete, not for the selected row, and sends nothing', () => {
    const { container, intent } = renderTab([row('a'), row('b'), row('c')]);

    fireEvent.click(screen.getByText('b'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete c' }));

    expect(screen.getByText('Delete runscript "c"?')).toBeInTheDocument();
    expect(screen.queryByText('Delete runscript "b"?')).toBeNull();
    expect(intent).not.toHaveBeenCalled();
    expect(selectedName(container)).toBe('b');
  });

  it('presses the focused Run button on Enter, so it sends execute and not open, while another row is selected', async () => {
    const user = userEvent.setup();
    const { intent } = renderTab([row('a'), row('b')]);

    fireEvent.click(screen.getByText('a'));
    screen.getByRole('button', { name: 'Run b' }).focus();
    await user.keyboard('{Enter}');

    expect(intent).toHaveBeenCalledWith('execute', { name: 'b' });
    expect(intent).not.toHaveBeenCalledWith('open', expect.anything());
  });

  it('opens the dialog for its row on Enter pressed on the Delete button of that row, and sends nothing', async () => {
    const user = userEvent.setup();
    const { intent } = renderTab([row('a'), row('b')]);

    fireEvent.click(screen.getByText('a'));
    screen.getByRole('button', { name: 'Delete b' }).focus();
    await user.keyboard('{Enter}');

    expect(screen.getByText('Delete runscript "b"?')).toBeInTheDocument();
    expect(intent).not.toHaveBeenCalled();
  });

  it('leaves the selection in place on ArrowDown pressed on a focused row button', () => {
    const { container } = renderTab([row('a'), row('b'), row('c')]);

    fireEvent.click(screen.getByText('a'));

    expect(fireEvent.keyDown(screen.getByRole('button', { name: 'Run b' }), { key: 'ArrowDown' })).toBe(true);
    expect(selectedName(container)).toBe('a');
  });
});

describe('ScriptsTab second click after the delete dialog closes', () => {
  it.each(['Delete', 'Cancel'])(
    'does not select or open the row beneath after a double-click on the dialog %s button',
    (label) => {
      const { container, intent } = renderTab([row('a'), row('b'), row('c')]);

      fireEvent.click(screen.getByText('a'));
      fireEvent.click(screen.getByRole('button', { name: 'Delete b' }));
      fireEvent.click(dialogButton(label), { detail: 1 });
      fireEvent.click(screen.getByText('c'), { detail: 2 });
      fireEvent.doubleClick(screen.getByText('c'), { detail: 2 });

      expect(intent).not.toHaveBeenCalledWith('open', expect.anything());
      expect(intent).not.toHaveBeenCalledWith('execute', expect.anything());
      expect(selectedName(container)).toBe('a');
    },
  );

  it('does not open a second dialog from the row Delete button beneath the closed dialog', () => {
    const { intent } = renderTab([row('a'), row('b'), row('c')]);

    fireEvent.click(screen.getByText('a'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete b' }));
    fireEvent.click(dialogButton('Cancel'), { detail: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Delete c' }), { detail: 2 });

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(intent).not.toHaveBeenCalled();
  });

  it('opens a row on a double-click that starts after the dialog closes', () => {
    const { container, intent } = renderTab([row('a'), row('b'), row('c')]);

    fireEvent.click(screen.getByText('a'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete b' }));
    fireEvent.click(dialogButton('Cancel'), { detail: 1 });
    fireEvent.click(screen.getByText('c'), { detail: 1 });
    fireEvent.click(screen.getByText('c'), { detail: 2 });
    fireEvent.doubleClick(screen.getByText('c'), { detail: 2 });

    expect(selectedName(container)).toBe('c');
    expect(intent).toHaveBeenCalledWith('open', { name: 'c' });
  });
});
