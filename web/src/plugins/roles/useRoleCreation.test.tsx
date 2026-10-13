import React, { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TabPluginClientCapabilities } from '../api';
import { useRoleCreation } from './useRoleCreation';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  // eslint-disable-next-line unicorn/prefer-promise-with-resolvers -- the web project's ES2023 library excludes Promise.withResolvers
  const promise = new Promise<T>((accept, refuse) => {
    resolve = accept;
    reject = refuse;
  });
  return { promise, resolve, reject };
}

function renderCreation() {
  const intent = vi.fn<(name: string, value: unknown) => Promise<unknown>>(async () => null);
  const send: TabPluginClientCapabilities['intent'] = async <Result,>(name: string, value: unknown) =>
    intent(name, value) as Promise<Result>;

  function Creation() {
    const [refusal, setRefusal] = useState<string | null>(null);
    const creation = useRoleCreation(send, setRefusal);
    return (
      <div>
        {refusal ? <p>{refusal}</p> : null}
        {creation.adding ? (
          <input
            aria-label="New role name"
            value={creation.newName}
            onChange={(event) => creation.typeName(event.target.value)}
          />
        ) : <button onClick={creation.openNewRole}>Add role</button>}
        <button onClick={() => void creation.commitNewRole()}>Commit</button>
        <button onClick={creation.closeNewRole}>Cancel</button>
      </div>
    );
  }

  render(<Creation />);
  const typeName = (name: string) => fireEvent.change(screen.getByLabelText('New role name'), { target: { value: name } });
  return { intent, typeName };
}

describe('useRoleCreation', () => {
  it('ignores a duplicate in-flight name but submits a different name immediately', async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    const { intent, typeName } = renderCreation();
    intent.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);

    fireEvent.click(screen.getByRole('button', { name: 'Add role' }));
    typeName('review');
    fireEvent.click(screen.getByRole('button', { name: 'Commit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Commit' }));
    typeName('planning');
    fireEvent.click(screen.getByRole('button', { name: 'Commit' }));

    expect(intent).toHaveBeenCalledTimes(2);
    expect(intent).toHaveBeenNthCalledWith(1, 'add-role', { name: 'review' });
    expect(intent).toHaveBeenNthCalledWith(2, 'add-role', { name: 'planning' });

    await act(async () => {
      first.resolve(null);
      second.resolve(null);
    });
    expect(screen.queryByLabelText('New role name')).toBeNull();
  });

  it('does not let an earlier acceptance erase a newer draft', async () => {
    const answer = deferred<unknown>();
    const { intent, typeName } = renderCreation();
    intent.mockReturnValue(answer.promise);

    fireEvent.click(screen.getByRole('button', { name: 'Add role' }));
    typeName('review');
    fireEvent.click(screen.getByRole('button', { name: 'Commit' }));
    typeName('review the migration');

    await act(async () => answer.resolve(null));

    expect(intent).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('New role name')).toHaveValue('review the migration');
  });

  it('keeps the submitted name editable after a refusal', async () => {
    const answer = deferred<unknown>();
    const { intent, typeName } = renderCreation();
    intent.mockReturnValue(answer.promise);

    fireEvent.click(screen.getByRole('button', { name: 'Add role' }));
    typeName('planning');
    fireEvent.click(screen.getByRole('button', { name: 'Commit' }));

    await act(async () => answer.reject(new Error('That role already exists.')));

    expect(screen.getByText('That role already exists.')).toBeInTheDocument();
    expect(screen.getByLabelText('New role name')).toHaveValue('planning');
  });
});
