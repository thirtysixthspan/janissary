import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RolesPayload } from '@shared/plugins/roles/shared';
import type { TabPluginClientCapabilities } from '../api';
import { RolesTab } from './RolesTab';

const CATALOG = { models: { codex: ['gpt-6-sol', 'gpt-6-luna'] }, efforts: ['low'] };

function payload(): RolesPayload {
  return {
    roles: [
      {
        name: 'planning',
        description: 'Plans.',
        entries: [{ harness: 'codex', model: 'gpt-6-sol' }, { harness: 'codex', model: 'gpt-6-luna' }],
      },
      {
        name: 'research',
        description: 'Research.',
        entries: [{ harness: 'codex', model: 'gpt-6-mini' }],
      },
    ],
    source: 'home',
    path: '/home/me/.janissary/roles.json',
    catalog: CATALOG,
  };
}

function renderTab() {
  const intent = vi.fn<(name: string, value: unknown) => Promise<unknown>>(async () => null);
  const capabilities = {
    resourceUrl: (reference: string) => reference,
    intent: async <Result,>(name: string, value: unknown) => intent(name, value) as Promise<Result>,
    copyText: vi.fn(),
    splitAction: null,
    active: true,
    dock: null,
    close: vi.fn(),
    reportFailure: vi.fn(),
  } as unknown as TabPluginClientCapabilities;
  const rendered = render(<RolesTab payload={payload()} capabilities={capabilities} />);
  const publish = (next: RolesPayload) => rendered.rerender(<RolesTab payload={next} capabilities={capabilities} />);
  const dataTransfer = () => ({ effectAllowed: '', dropEffect: '' });
  return { ...rendered, intent, dataTransfer, publish };
}

function card(name: string): HTMLElement {
  return screen.getByDisplayValue(name).closest('.roles-card') as HTMLElement;
}

function catalogModel(model: string): HTMLElement {
  const catalog = document.querySelector('.roles-catalog') as HTMLElement;
  return [...catalog.querySelectorAll('li')].find((item) => item.textContent === model) as HTMLElement;
}

function entryRow(model: string): HTMLElement {
  const list = document.querySelector('.roles-list') as HTMLElement;
  return [...list.querySelectorAll('.roles-entry')]
    .find((row) => row.querySelector('.roles-entry-model')?.textContent === model) as HTMLElement;
}

describe('dragging between the catalog and the roles', () => {
  it.each(['catalog', 'entry'])('retains the drag-start snapshot across publication before a drop on $0', (destination) => {
    const { intent, container, dataTransfer, publish } = renderTab();
    const initial = payload();
    fireEvent.dragStart(entryRow('gpt-6-sol'), { dataTransfer: dataTransfer() });
    const next = payload();
    next.roles[0].entries = next.roles[0].entries.toReversed();
    publish(next);

    if (destination === 'catalog') {
      fireEvent.drop(container.querySelector('.roles-catalog') as HTMLElement, { dataTransfer: dataTransfer() });
      expect(intent).toHaveBeenCalledWith('remove-entry', { role: 'planning', index: 0, expected: initial.roles[0].entries });
    } else {
      fireEvent.drop(entryRow('gpt-6-sol'), { dataTransfer: dataTransfer() });
      expect(intent).toHaveBeenCalledWith('move-entry', { role: 'planning', from: 0, to: 1, expected: initial.roles[0].entries });
    }
    expect(intent).toHaveBeenCalledTimes(1);
  });

  it('shows a stale drag rejection beneath the source line', async () => {
    const { intent, container, dataTransfer } = renderTab();
    const message = 'The entries of role "planning" changed elsewhere — retry the edit on the current list. Nothing was written.';
    intent.mockRejectedValueOnce(new Error(message));
    fireEvent.dragStart(entryRow('gpt-6-sol'), { dataTransfer: dataTransfer() });
    fireEvent.drop(container.querySelector('.roles-catalog') as HTMLElement, { dataTransfer: dataTransfer() });

    expect(await screen.findByText(message)).toHaveClass('roles-refusal');
    expect(entryRow('gpt-6-sol')).toBeInTheDocument();
  });

  it('adds a dragged catalog model as a new entry on the card it lands on', () => {
    const { intent, container, dataTransfer } = renderTab();
    const model = catalogModel('gpt-6-luna');

    fireEvent.dragStart(model, { dataTransfer: dataTransfer() });
    fireEvent.dragOver(card('research'), { dataTransfer: dataTransfer() });
    fireEvent.drop(card('research'), { dataTransfer: dataTransfer() });

    expect(intent).toHaveBeenCalledWith('add-entry', {
      role: 'research', entry: { harness: 'codex', model: 'gpt-6-luna' },
    });
    // The gesture ends, so a second drop raises nothing.
    fireEvent.drop(card('planning'), { dataTransfer: dataTransfer() });
    expect(intent).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.roles-catalog')).not.toBeNull();
  });

  it('adds a dragged catalog model dropped on an existing entry row', () => {
    const { intent, dataTransfer } = renderTab();
    const model = catalogModel('gpt-6-luna');

    fireEvent.dragStart(model, { dataTransfer: dataTransfer() });
    fireEvent.drop(entryRow('gpt-6-sol'), { dataTransfer: dataTransfer() });

    expect(intent).toHaveBeenCalledTimes(1);
    expect(intent).toHaveBeenCalledWith('add-entry', {
      role: 'planning', entry: { harness: 'codex', model: 'gpt-6-luna' },
    });
  });

  it('adds a dragged catalog model dropped on a control inside an entry row', () => {
    const { intent, dataTransfer } = renderTab();
    const model = catalogModel('gpt-6-luna');
    const controls = [screen.getByLabelText('Effort for gpt-6-sol'), screen.getByTitle('Remove gpt-6-sol')];

    for (const control of controls) {
      fireEvent.dragStart(model, { dataTransfer: dataTransfer() });
      fireEvent.drop(control, { dataTransfer: dataTransfer() });
    }

    expect(intent).toHaveBeenCalledTimes(2);
    expect(intent).toHaveBeenLastCalledWith('add-entry', {
      role: 'planning', entry: { harness: 'codex', model: 'gpt-6-luna' },
    });
  });

  it('takes an entry out of its role when it is dropped on the catalog column', () => {
    const { intent, container, dataTransfer } = renderTab();
    const entry = container.querySelector('.roles-entry') as HTMLElement;

    fireEvent.dragStart(entry, { dataTransfer: dataTransfer() });
    fireEvent.drop(container.querySelector('.roles-catalog') as HTMLElement, { dataTransfer: dataTransfer() });

    expect(intent).toHaveBeenCalledWith('remove-entry', { role: 'planning', index: 0, expected: payload().roles[0].entries });
  });

  it('moves an entry onto the sibling entry it is dropped on, and raises it once', () => {
    const { intent, dataTransfer } = renderTab();

    fireEvent.dragStart(entryRow('gpt-6-sol'), { dataTransfer: dataTransfer() });
    fireEvent.drop(entryRow('gpt-6-luna'), { dataTransfer: dataTransfer() });

    expect(intent).toHaveBeenCalledTimes(1);
    expect(intent).toHaveBeenCalledWith('move-entry', { role: 'planning', from: 0, to: 1, expected: payload().roles[0].entries });
  });

  it('raises nothing when an entry is dropped on itself or on another role\'s entry', () => {
    const { intent, dataTransfer } = renderTab();
    const row = entryRow('gpt-6-sol');

    fireEvent.dragStart(row, { dataTransfer: dataTransfer() });
    fireEvent.drop(row, { dataTransfer: dataTransfer() });
    fireEvent.dragStart(row, { dataTransfer: dataTransfer() });
    fireEvent.drop(entryRow('gpt-6-mini'), { dataTransfer: dataTransfer() });

    expect(intent).not.toHaveBeenCalled();
  });

  it('moves a role onto the position of the card it is dropped on', () => {
    const { intent, dataTransfer } = renderTab();

    fireEvent.dragStart(card('planning').querySelector('.roles-grip') as HTMLElement, { dataTransfer: dataTransfer() });
    fireEvent.drop(card('research'), { dataTransfer: dataTransfer() });

    expect(intent).toHaveBeenCalledWith('move-role', { name: 'planning', to: 1 });
  });

  it('raises nothing when a role is dropped back onto itself', () => {
    const { intent, dataTransfer } = renderTab();

    fireEvent.dragStart(card('planning').querySelector('.roles-grip') as HTMLElement, { dataTransfer: dataTransfer() });
    fireEvent.drop(card('planning'), { dataTransfer: dataTransfer() });

    expect(intent).not.toHaveBeenCalled();
  });

  it('outlines a card while a compatible drag is over it, and not otherwise', () => {
    const { dataTransfer } = renderTab();

    fireEvent.dragStart(catalogModel('gpt-6-luna'), { dataTransfer: dataTransfer() });
    fireEvent.dragOver(card('research'), { dataTransfer: dataTransfer() });
    expect(card('research').className).toContain('roles-drop');
    fireEvent.dragLeave(card('research'));
    expect(card('research').className).not.toContain('roles-drop');
  });

  it('moves a role onto the position of the card whose entry row it lands on', () => {
    const { intent, dataTransfer } = renderTab();

    fireEvent.dragStart(card('planning').querySelector('.roles-grip') as HTMLElement, { dataTransfer: dataTransfer() });
    fireEvent.drop(entryRow('gpt-6-mini'), { dataTransfer: dataTransfer() });

    expect(intent).toHaveBeenCalledTimes(1);
    expect(intent).toHaveBeenCalledWith('move-role', { name: 'planning', to: 1 });
  });

  it('raises nothing when a role is dropped on an entry row of its own card', () => {
    const { intent, dataTransfer } = renderTab();

    fireEvent.dragStart(card('planning').querySelector('.roles-grip') as HTMLElement, { dataTransfer: dataTransfer() });
    fireEvent.drop(entryRow('gpt-6-sol'), { dataTransfer: dataTransfer() });

    expect(intent).not.toHaveBeenCalled();
  });
});
