import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RolesPayload } from '@shared/plugins/roles/shared';
import type { TabPluginClientCapabilities } from '../api';
import { RolesTab } from './RolesTab';

const CATALOG = {
  models: { codex: ['gpt-6-sol', 'gpt-6-luna'], claude: ['claude-opus-5-5'] },
  efforts: ['low', 'xhigh'],
};

function makePayload(overrides: Partial<RolesPayload> = {}): RolesPayload {
  return {
    roles: [
      { name: 'planning', description: 'Plans.', entries: [{ harness: 'codex', model: 'gpt-6-sol', effort: 'xhigh' }] },
      { name: 'research', description: 'Research.', entries: [] },
    ],
    source: 'home',
    path: '/home/me/.janissary/roles.json',
    catalog: CATALOG,
    ...overrides,
  };
}

function renderTab(payload: RolesPayload = makePayload()) {
  const refused = new Map<string, string>();
  const spent = new Set<string>();
  const intent = vi.fn<(name: string, value: unknown) => Promise<unknown>>(async (name) => {
    const refusal = refused.get(name);
    if (refusal !== undefined && !spent.has(name)) {
      spent.add(name);
      throw new Error(refusal);
    }
    return null;
  });
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
  const rendered = render(<RolesTab payload={payload} capabilities={capabilities} />);
  return { ...rendered, intent, refuse: (name: string, message: string) => refused.set(name, message) };
}

describe('RolesTab', () => {
  it('renders the catalog beside the roles and names the file in effect', () => {
    const { container } = renderTab();

    expect(container.querySelector('.roles-catalog')).not.toBeNull();
    expect(container.querySelector('.roles-list')).not.toBeNull();
    expect(screen.getByText('Editing /home/me/.janissary/roles.json')).toBeInTheDocument();
    // The catalog column lists every harness and model the host published.
    expect(screen.getAllByText('codex').length).toBeGreaterThan(0);
    expect(screen.getByText('claude-opus-5-5')).toBeInTheDocument();
    expect(screen.getByDisplayValue('planning')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Research.')).toBeInTheDocument();
  });

  it('shows a problem line and the no-file-in-effect wording when no file decodes', () => {
    renderTab(makePayload({
      source: 'default',
      problem: 'roles.json is not valid JSON at /home/me/.janissary/roles.json — showing default roles.',
    }));

    expect(screen.getByText('No roles file in effect')).toBeInTheDocument();
    expect(screen.getByText(/showing default roles/)).toBeInTheDocument();
  });

  it('shows the empty state and no cards when the list is empty', () => {
    const { container } = renderTab(makePayload({ roles: [] }));

    expect(screen.getByText('No roles yet.')).toBeInTheDocument();
    expect(container.querySelectorAll('.roles-card')).toHaveLength(0);
  });

  it('commits a renamed role on blur and an unchanged name writes nothing', () => {
    const { intent } = renderTab();
    const input = screen.getByDisplayValue('research');

    fireEvent.change(input, { target: { value: 'code review' } });
    fireEvent.blur(input);

    expect(intent).toHaveBeenCalledWith('rename-role', { name: 'research', next: 'code review' });
  });

  it('commits a changed description on blur, and writes nothing when it is unchanged', () => {
    const { intent } = renderTab();
    const input = screen.getByDisplayValue('Research.');

    fireEvent.change(input, { target: { value: 'Deeper questions.' } });
    fireEvent.blur(input);
    expect(intent).toHaveBeenCalledWith('describe-role', { name: 'research', description: 'Deeper questions.' });

    renderTab();
    fireEvent.blur(screen.getByDisplayValue('Research.'));
    expect(intent).toHaveBeenCalledTimes(1);
  });

  it('reverts the name on Escape without writing', () => {
    const { intent } = renderTab();
    const input = screen.getByDisplayValue('research');

    fireEvent.change(input, { target: { value: 'nope' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(intent).not.toHaveBeenCalled();
    expect(input).toHaveValue('research');
  });

  it('sets and clears an entry effort through the dropdown', () => {
    const { intent } = renderTab();
    const select = screen.getByLabelText('Effort for gpt-6-sol');

    fireEvent.change(select, { target: { value: 'low' } });
    expect(intent).toHaveBeenCalledWith('set-entry-effort', { role: 'planning', index: 0, effort: 'low' });
    fireEvent.change(select, { target: { value: '' } });
    expect(intent).toHaveBeenCalledWith('set-entry-effort', { role: 'planning', index: 0, effort: null });
  });

  it('removes an entry and deletes a role by their controls', () => {
    const { intent } = renderTab();

    fireEvent.click(screen.getByTitle('Remove gpt-6-sol'));
    expect(intent).toHaveBeenCalledWith('remove-entry', { role: 'planning', index: 0 });

    fireEvent.click(screen.getByTitle('Delete role research'));
    expect(intent).toHaveBeenCalledWith('delete-role', { name: 'research' });
  });

  it('adds an entry through the picker without a pointer drag', () => {
    const { intent } = renderTab();
    const card = screen.getByDisplayValue('research').closest('.roles-card') as HTMLElement;

    fireEvent.click(card.querySelector('.roles-add-entry') as HTMLElement);
    fireEvent.change(screen.getByLabelText('Harness for the new entry'), { target: { value: 'codex' } });
    fireEvent.change(screen.getByLabelText('Model for the new entry'), { target: { value: 'gpt-6-luna' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(intent).toHaveBeenCalledWith('add-entry', {
      role: 'research', entry: { harness: 'codex', model: 'gpt-6-luna' },
    });
  });

  it('adds a role from the inline name field, and Escape cancels it', () => {
    const { intent } = renderTab();

    fireEvent.click(screen.getByRole('button', { name: 'Add role' }));
    const input = screen.getByLabelText('New role name');
    fireEvent.change(input, { target: { value: 'review' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(intent).toHaveBeenCalledWith('add-role', { name: 'review' });

    fireEvent.click(screen.getByRole('button', { name: 'Add role' }));
    const cancelled = screen.getByLabelText('New role name');
    fireEvent.change(cancelled, { target: { value: 'scratch' } });
    fireEvent.keyDown(cancelled, { key: 'Escape' });

    expect(screen.queryByLabelText('New role name')).toBeNull();
    expect(intent).toHaveBeenCalledTimes(1);
  });

  it('refuses an entry dropped from the catalog onto no card without raising anything', () => {
    const { container, intent } = renderTab();
    const catalog = container.querySelector('.roles-catalog') as HTMLElement;

    fireEvent.drop(catalog, { dataTransfer: { effectAllowed: '', dropEffect: '' } });

    expect(intent).not.toHaveBeenCalled();
  });

  describe('showing a refusal', () => {
    it('renders the message a rejected rename, add, and write each carry', async () => {
      const { refuse } = renderTab();
      refuse('rename-role', 'A role named "code review" already exists.');
      const name = screen.getByDisplayValue('research');

      fireEvent.change(name, { target: { value: 'code review' } });
      fireEvent.blur(name);

      expect(await screen.findByText('A role named "code review" already exists.')).toHaveClass('roles-refusal');

      refuse('add-role', 'No role named "review".');
      fireEvent.click(screen.getByRole('button', { name: 'Add role' }));
      const added = screen.getByLabelText('New role name');
      fireEvent.change(added, { target: { value: 'review' } });
      fireEvent.blur(added);

      expect(await screen.findByText('No role named "review".')).toHaveClass('roles-refusal');

      refuse('remove-entry', 'Could not write roles.json at /home/me/.janissary/roles.json.');
      fireEvent.click(screen.getByTitle('Remove gpt-6-sol'));

      expect(await screen.findByText(/Could not write roles.json/)).toHaveClass('roles-refusal');
    });

    it('clears the refusal once an edit succeeds', async () => {
      const { refuse } = renderTab();
      refuse('rename-role', 'A role named "code review" already exists.');
      const name = screen.getByDisplayValue('research');
      fireEvent.change(name, { target: { value: 'code review' } });
      fireEvent.blur(name);
      expect(await screen.findByText(/already exists\./)).toBeInTheDocument();

      const next = screen.getByDisplayValue('code review');
      fireEvent.change(next, { target: { value: 'review' } });
      fireEvent.blur(next);

      await vi.waitFor(() => expect(document.querySelector('.roles-refusal')).toBeNull());
    });

    it('keeps the payload problem line and a refusal as separate lines', async () => {
      const { refuse } = renderTab(makePayload({
        problem: 'roles.json dropped 1 malformed role or entry at /home/me/.janissary/roles.json — showing the rest of this file.',
      }));
      refuse('delete-role', 'No role named "research".');

      fireEvent.click(screen.getByTitle('Delete role research'));

      expect(await screen.findByText('No role named "research".')).toHaveClass('roles-refusal');
      expect(screen.getByText(/showing the rest of this file\./)).toHaveClass('roles-problem');
    });
  });
});