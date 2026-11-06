import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NATIVE_ACP_COMMANDS, type RolesPayload } from '@shared/plugins/roles/shared';
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
        commands: [],
      },
      {
        name: 'research',
        description: 'Research.',
        entries: [{ harness: 'codex', model: 'gpt-6-mini' }],
        commands: [],
      },
    ],
    nativeCommands: [...NATIVE_ACP_COMMANDS],
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

function entryRow(model: string): HTMLElement {
  const roles = document.querySelector('.roles-list') as HTMLElement;
  return [...roles.querySelectorAll('.roles-entry')]
    .find((row) => row.querySelector('.roles-entry-model')?.textContent === model) as HTMLElement;
}

function roleGrip(name: string): HTMLElement {
  return card(name).querySelector('.roles-grip') as HTMLElement;
}

describe('reordering roles and entries', () => {
  it('retains the entry drag-start snapshot across publication before a sibling drop', () => {
    const { intent, dataTransfer, publish } = renderTab();
    const initial = payload();
    fireEvent.dragStart(entryRow('gpt-6-sol'), { dataTransfer: dataTransfer() });
    const next = payload();
    next.roles[0].entries = next.roles[0].entries.toReversed();
    publish(next);

    fireEvent.drop(entryRow('gpt-6-sol'), { dataTransfer: dataTransfer() });

    expect(intent).toHaveBeenCalledWith('move-entry', {
      role: 'planning', from: 0, to: 1, expected: initial.roles[0].entries,
    });
  });

  it('shows a stale entry-order refusal after a sibling drop', async () => {
    const { intent, dataTransfer } = renderTab();
    const message = 'The entries of role "planning" changed elsewhere — retry the edit on the current list. Nothing was written.';
    intent.mockRejectedValueOnce(new Error(message));

    fireEvent.dragStart(entryRow('gpt-6-sol'), { dataTransfer: dataTransfer() });
    fireEvent.drop(entryRow('gpt-6-luna'), { dataTransfer: dataTransfer() });

    expect(await screen.findByText(message)).toHaveClass('roles-refusal');
    expect(entryRow('gpt-6-sol')).toBeInTheDocument();
  });

  it('moves an entry to its sibling position and raises the intent once', () => {
    const { intent, dataTransfer } = renderTab();

    fireEvent.dragStart(entryRow('gpt-6-sol'), { dataTransfer: dataTransfer() });
    fireEvent.drop(entryRow('gpt-6-luna'), { dataTransfer: dataTransfer() });

    expect(intent).toHaveBeenCalledExactlyOnceWith('move-entry', {
      role: 'planning', from: 0, to: 1, expected: payload().roles[0].entries,
    });
  });

  it('raises nothing when an entry is dropped on itself or another role entry', () => {
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

    fireEvent.dragStart(roleGrip('planning'), { dataTransfer: dataTransfer() });
    fireEvent.drop(card('research'), { dataTransfer: dataTransfer() });

    expect(intent).toHaveBeenCalledWith('move-role', { name: 'planning', to: 1 });
  });

  it('raises nothing when a role is dropped back onto itself', () => {
    const { intent, dataTransfer } = renderTab();

    fireEvent.dragStart(roleGrip('planning'), { dataTransfer: dataTransfer() });
    fireEvent.drop(card('planning'), { dataTransfer: dataTransfer() });

    expect(intent).not.toHaveBeenCalled();
  });

  it('outlines a card while a role reorder is over it', () => {
    const { dataTransfer } = renderTab();

    fireEvent.dragStart(roleGrip('planning'), { dataTransfer: dataTransfer() });
    fireEvent.dragOver(card('research'), { dataTransfer: dataTransfer() });
    expect(card('research').className).toContain('roles-drop');
    fireEvent.dragLeave(card('research'));
    expect(card('research').className).not.toContain('roles-drop');
  });

  it('moves a role dropped on another card entry row', () => {
    const { intent, dataTransfer } = renderTab();

    fireEvent.dragStart(roleGrip('planning'), { dataTransfer: dataTransfer() });
    fireEvent.drop(entryRow('gpt-6-mini'), { dataTransfer: dataTransfer() });

    expect(intent).toHaveBeenCalledExactlyOnceWith('move-role', { name: 'planning', to: 1 });
  });

  it('raises nothing when a role is dropped on an entry in its own card', () => {
    const { intent, dataTransfer } = renderTab();

    fireEvent.dragStart(roleGrip('planning'), { dataTransfer: dataTransfer() });
    fireEvent.drop(entryRow('gpt-6-sol'), { dataTransfer: dataTransfer() });

    expect(intent).not.toHaveBeenCalled();
  });
});
