import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
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

function renderTab(payload: RolesPayload = makePayload(), answer?: (name: string) => Promise<unknown>) {
  const refused = new Map<string, string>();
  const spent = new Set<string>();
  const intent = vi.fn<(name: string, value: unknown) => Promise<unknown>>(async (name) => {
    if (answer) return answer(name);
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
  // A republished payload reaching the same mounted tab is what another client's accepted edit looks
  // like from here, so the helper hands one back rather than forcing a fresh render.
  const publish = (next: RolesPayload) =>
    rendered.rerender(<RolesTab payload={next} capabilities={capabilities} />);
  return { ...rendered, intent, publish, refuse: (name: string, message: string) => refused.set(name, message) };
}

function withDescription(name: string, description: string): RolesPayload {
  const payload = makePayload();
  return {
    ...payload,
    roles: payload.roles.map((role) => (role.name === name ? { ...role, description } : role)),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  // eslint-disable-next-line unicorn/prefer-promise-with-resolvers -- the web project's ES2023 library excludes Promise.withResolvers
  const promise = new Promise<T>((accept) => { resolve = accept; });
  return { promise, resolve };
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
    expect(intent).toHaveBeenCalledWith('describe-role', {
      name: 'research', description: 'Deeper questions.', expected: 'Research.',
    });

    renderTab();
    fireEvent.blur(screen.getByDisplayValue('Research.'));
    expect(intent).toHaveBeenCalledTimes(1);
  });

  describe('a description the tab learns about from a payload update', () => {
    it('follows the stored text and raises nothing when the field was never typed in', () => {
      const { intent, publish } = renderTab();

      publish(withDescription('research', 'Deeper questions.'));
      const input = screen.getByLabelText('Description of role research');
      expect(input).toHaveValue('Deeper questions.');

      fireEvent.blur(input);
      expect(intent).not.toHaveBeenCalled();
    });

    it('replaces an active draft and says why the stored text is back', async () => {
      const { publish } = renderTab();
      const input = screen.getByLabelText('Description of role research');
      fireEvent.change(input, { target: { value: 'Half typed.' } });

      publish(withDescription('research', 'Deeper questions.'));

      expect(input).toHaveValue('Deeper questions.');
      expect(await screen.findByText('The description of "research" changed elsewhere — showing the stored one.'))
        .toHaveClass('roles-refusal');
    });

    it('keeps an active draft when the update changed another role, and commits the text it saw', () => {
      const { intent, publish } = renderTab();
      const input = screen.getByLabelText('Description of role research');
      fireEvent.change(input, { target: { value: 'Half typed.' } });

      publish(withDescription('planning', 'Plans, thoroughly.'));

      expect(input).toHaveValue('Half typed.');
      fireEvent.blur(input);
      expect(intent).toHaveBeenCalledWith('describe-role', {
        name: 'research', description: 'Half typed.', expected: 'Research.',
      });
    });

    it('reverts to the stored text when Escape follows a payload update', () => {
      const { intent, publish } = renderTab();
      publish(withDescription('research', 'Deeper questions.'));
      const input = screen.getByLabelText('Description of role research');

      fireEvent.change(input, { target: { value: 'Half typed.' } });
      fireEvent.keyDown(input, { key: 'Escape' });

      expect(input).toHaveValue('Deeper questions.');
      fireEvent.blur(input);
      expect(intent).not.toHaveBeenCalled();
    });

    it('keeps a refused description on screen so it can be corrected', async () => {
      const { refuse } = renderTab();
      refuse('describe-role', 'The description of role "research" changed elsewhere — nothing was written.');
      const input = screen.getByLabelText('Description of role research');

      fireEvent.change(input, { target: { value: 'Half typed.' } });
      fireEvent.blur(input);

      expect(await screen.findByText(/changed elsewhere/)).toHaveClass('roles-refusal');
      expect(input).toHaveValue('Half typed.');
    });
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
    expect(intent).toHaveBeenCalledWith('set-entry-effort', { role: 'planning', index: 0, effort: 'low', expected: makePayload().roles[0].entries });
    fireEvent.change(select, { target: { value: '' } });
    expect(intent).toHaveBeenCalledWith('set-entry-effort', { role: 'planning', index: 0, effort: null, expected: makePayload().roles[0].entries });
  });

  it('submits the whole displayed list for removal and effort edits on duplicate choices', () => {
    const payload = makePayload();
    payload.roles[0].entries = [payload.roles[0].entries[0], { ...payload.roles[0].entries[0] }];
    const { intent } = renderTab(payload);

    fireEvent.click(screen.getAllByTitle('Remove gpt-6-sol')[1]);
    expect(intent).toHaveBeenCalledWith('remove-entry', {
      role: 'planning', index: 1, expected: payload.roles[0].entries,
    });
    fireEvent.change(screen.getAllByLabelText('Effort for gpt-6-sol')[1], { target: { value: 'low' } });
    expect(intent).toHaveBeenCalledWith('set-entry-effort', {
      role: 'planning', index: 1, effort: 'low', expected: payload.roles[0].entries,
    });
  });

  it('shows a stale control rejection and uses the refreshed snapshot for a retry', async () => {
    const { intent, refuse, publish } = renderTab();
    const message = 'The entries of role "planning" changed elsewhere — retry the edit on the current list. Nothing was written.';
    refuse('remove-entry', message);
    fireEvent.click(screen.getByTitle('Remove gpt-6-sol'));
    expect(await screen.findByText(message)).toHaveClass('roles-refusal');

    const next = makePayload();
    next.roles[0].entries = [{ harness: 'codex', model: 'gpt-6-luna', effort: 'low' }];
    publish(next);
    fireEvent.click(screen.getByTitle('Remove gpt-6-luna'));

    expect(intent).toHaveBeenLastCalledWith('remove-entry', {
      role: 'planning', index: 0, expected: next.roles[0].entries,
    });
    await vi.waitFor(() => expect(screen.queryByText(message)).toBeNull());
  });

  it('removes an entry and deletes a role by their controls', () => {
    const { intent } = renderTab();

    fireEvent.click(screen.getByTitle('Remove gpt-6-sol'));
    expect(intent).toHaveBeenCalledWith('remove-entry', { role: 'planning', index: 0, expected: makePayload().roles[0].entries });

    fireEvent.click(screen.getByTitle('Delete role research'));
    expect(intent).toHaveBeenCalledWith('delete-role', { name: 'research' });
  });

  it('adds an entry through the picker without a pointer drag, at the default effort', () => {
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

  it('adds an entry through the picker with the effort it chose', () => {
    const { intent } = renderTab();
    const card = screen.getByDisplayValue('research').closest('.roles-card') as HTMLElement;

    fireEvent.click(card.querySelector('.roles-add-entry') as HTMLElement);
    fireEvent.change(screen.getByLabelText('Harness for the new entry'), { target: { value: 'codex' } });
    fireEvent.change(screen.getByLabelText('Model for the new entry'), { target: { value: 'gpt-6-luna' } });
    fireEvent.change(screen.getByLabelText('Effort for the new entry'), { target: { value: 'xhigh' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(intent).toHaveBeenCalledWith('add-entry', {
      role: 'research', entry: { harness: 'codex', model: 'gpt-6-luna', effort: 'xhigh' },
    });
  });

  it('returns the picker effort to the default on another harness and on a reopen', () => {
    renderTab();
    const card = screen.getByDisplayValue('research').closest('.roles-card') as HTMLElement;
    const open = () => fireEvent.click(card.querySelector('.roles-add-entry') as HTMLElement);

    open();
    fireEvent.change(screen.getByLabelText('Effort for the new entry'), { target: { value: 'xhigh' } });
    fireEvent.change(screen.getByLabelText('Harness for the new entry'), { target: { value: 'claude' } });
    expect(screen.getByLabelText('Effort for the new entry')).toHaveValue('');

    fireEvent.change(screen.getByLabelText('Model for the new entry'), { target: { value: 'claude-opus-5-5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    open();
    expect(screen.getByLabelText('Effort for the new entry')).toHaveValue('');
  });

  it('adds a role from the inline name field, and Escape cancels it', async () => {
    const { intent } = renderTab();

    fireEvent.click(screen.getByRole('button', { name: 'Add role' }));
    const named = screen.getByLabelText('New role name');
    fireEvent.change(named, { target: { value: 'review' } });
    fireEvent.keyDown(named, { key: 'Enter' });

    expect(intent).toHaveBeenCalledWith('add-role', { name: 'review' });
    await vi.waitFor(() => expect(screen.queryByLabelText('New role name')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Add role' }));
    const cancelled = screen.getByLabelText('New role name');
    fireEvent.change(cancelled, { target: { value: 'scratch' } });
    fireEvent.keyDown(cancelled, { key: 'Escape' });

    expect(screen.queryByLabelText('New role name')).toBeNull();
    expect(intent).toHaveBeenCalledTimes(1);
  });

  it('closes the creation field on an empty blur without raising anything', () => {
    const { intent } = renderTab();

    fireEvent.click(screen.getByRole('button', { name: 'Add role' }));
    fireEvent.blur(screen.getByLabelText('New role name'));

    expect(intent).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('New role name')).toBeNull();
  });

  describe('a new role name the server refuses', () => {
    const typeAndCommit = (name: string) => {
      fireEvent.click(screen.getByRole('button', { name: 'Add role' }));
      const input = screen.getByLabelText('New role name');
      fireEvent.change(input, { target: { value: name } });
      fireEvent.blur(input);
    };

    it('keeps the refused name editable so it can be corrected and committed', async () => {
      const { refuse, intent } = renderTab();
      refuse('add-role', 'A role named "planning" already exists.');

      typeAndCommit('planning');

      expect(await screen.findByText('A role named "planning" already exists.')).toHaveClass('roles-refusal');
      const kept = screen.getByLabelText('New role name');
      expect(kept).toHaveValue('planning');

      fireEvent.change(kept, { target: { value: 'planning-role' } });
      fireEvent.blur(kept);

      expect(intent).toHaveBeenLastCalledWith('add-role', { name: 'planning-role' });
      await vi.waitFor(() => expect(screen.queryByLabelText('New role name')).toBeNull());
    });

    it('keeps the name when the refusal was a write failure rather than a duplicate', async () => {
      const { refuse } = renderTab();
      refuse('add-role', 'Could not write roles.json at /home/me/.janissary/roles.json.');

      typeAndCommit('review');

      expect(await screen.findByText(/Could not write roles.json/)).toHaveClass('roles-refusal');
      expect(screen.getByLabelText('New role name')).toHaveValue('review');
    });

    it('keeps typing made while a delayed answer is still coming', async () => {
      const answer = deferred<unknown>();
      const { intent } = renderTab(makePayload(), () => answer.promise);

      typeAndCommit('review');
      const input = screen.getByLabelText('New role name');
      fireEvent.change(input, { target: { value: 'review of the migration' } });

      await act(async () => { answer.resolve(null); });

      expect(intent).toHaveBeenCalledTimes(1);
      expect(screen.getByLabelText('New role name')).toHaveValue('review of the migration');
    });

    it('submits one name once when Enter is pressed again before the answer lands', async () => {
      const answer = deferred<unknown>();
      const { intent } = renderTab(makePayload(), () => answer.promise);

      fireEvent.click(screen.getByRole('button', { name: 'Add role' }));
      const input = screen.getByLabelText('New role name');
      fireEvent.change(input, { target: { value: 'review' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      input.focus();
      fireEvent.keyDown(input, { key: 'Enter' });

      await act(async () => { answer.resolve(null); });

      expect(intent).toHaveBeenCalledTimes(1);
    });
  });

  it('shows a stored effort the catalog does not offer, and still clears it back to the default', () => {
    const payload = makePayload();
    payload.roles[0] = {
      ...payload.roles[0],
      entries: [{ harness: 'codex', model: 'gpt-6-sol', effort: 'ultra' }],
    };
    const { intent } = renderTab(payload);
    const select = screen.getByLabelText('Effort for gpt-6-sol');

    expect(select).toHaveValue('ultra');
    expect(screen.getByRole('option', { name: 'ultra' })).toBeInTheDocument();

    fireEvent.change(select, { target: { value: '' } });
    expect(intent).toHaveBeenCalledWith('set-entry-effort', { role: 'planning', index: 0, effort: null, expected: payload.roles[0].entries });
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
