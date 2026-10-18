import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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

  it('sends nothing and leaves the selection in place on Delete and Backspace, without preventing their default', () => {
    const { container, intent } = renderTab([row('a'), row('b')]);
    const list = container.querySelector('.scripts-tab')!;

    fireEvent.click(screen.getByText('b'));

    expect(fireEvent.keyDown(list, { key: 'Delete' })).toBe(true);
    expect(fireEvent.keyDown(list, { key: 'Backspace' })).toBe(true);
    expect(intent).not.toHaveBeenCalled();
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
