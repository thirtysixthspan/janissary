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
      { name: 'research', description: 'Research.', entries: [] },
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
  const dataTransfer = () => ({ effectAllowed: '', dropEffect: '' });
  return { ...rendered, intent, dataTransfer };
}

function card(name: string): HTMLElement {
  return screen.getByDisplayValue(name).closest('.roles-card') as HTMLElement;
}

function catalogModel(model: string): HTMLElement {
  const catalog = document.querySelector('.roles-catalog') as HTMLElement;
  return [...catalog.querySelectorAll('li')].find((item) => item.textContent === model) as HTMLElement;
}

describe('dragging between the catalog and the roles', () => {
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

  it('takes an entry out of its role when it is dropped on the catalog column', () => {
    const { intent, container, dataTransfer } = renderTab();
    const entry = container.querySelector('.roles-entry') as HTMLElement;

    fireEvent.dragStart(entry, { dataTransfer: dataTransfer() });
    fireEvent.drop(container.querySelector('.roles-catalog') as HTMLElement, { dataTransfer: dataTransfer() });

    expect(intent).toHaveBeenCalledWith('remove-entry', { role: 'planning', index: 0 });
  });

  it('moves an entry onto the sibling entry it is dropped on', () => {
    const { intent, container, dataTransfer } = renderTab();
    const entries = container.querySelectorAll('.roles-entry');

    fireEvent.dragStart(entries[0] as HTMLElement, { dataTransfer: dataTransfer() });
    fireEvent.drop(entries[1] as HTMLElement, { dataTransfer: dataTransfer() });

    expect(intent).toHaveBeenCalledWith('move-entry', { role: 'planning', from: 0, to: 1 });
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

  it('does not allow a role drag over an entry row', () => {
    const { intent, container, dataTransfer } = renderTab();
    const entry = container.querySelector('.roles-entry') as HTMLElement;

    fireEvent.dragStart(card('planning').querySelector('.roles-grip') as HTMLElement, { dataTransfer: dataTransfer() });
    fireEvent.drop(entry, { dataTransfer: dataTransfer() });

    expect(intent).not.toHaveBeenCalled();
  });
});