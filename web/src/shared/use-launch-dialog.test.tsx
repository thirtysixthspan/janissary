import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { JanusClient } from '../ws';
import { useLaunchDialog } from './use-launch-dialog';

type Fields = { name: string };

const buildCommand = (fields: Fields) => `launch ${fields.name}`;

function Dialog({
  client,
  hadRemembered = false,
  canSubmit,
}: {
  client: JanusClient;
  hadRemembered?: boolean;
  canSubmit?: (fields: Fields) => boolean;
}) {
  const { dialogRef, submitButtonRef } = useLaunchDialog(
    client,
    'closeHarnessLaunch',
    { name: 'claude' },
    buildCommand,
    hadRemembered,
    canSubmit,
  );
  return (
    <div ref={dialogRef} tabIndex={-1}>
      <button ref={submitButtonRef}>Create</button>
    </div>
  );
}

function makeClient() {
  const send = vi.fn();
  return { client: { send } as unknown as JanusClient, send };
}

describe('useLaunchDialog', () => {
  it('sends only the close RPC on Escape', () => {
    const { client, send } = makeClient();
    render(<Dialog client={client} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(send.mock.calls).toEqual([[{ method: 'closeHarnessLaunch', params: {} }]]);
  });

  it('sends the built command and then the close RPC on Enter', () => {
    const { client, send } = makeClient();
    render(<Dialog client={client} />);

    fireEvent.keyDown(document, { key: 'Enter' });

    expect(send.mock.calls).toEqual([
      [{ method: 'command', params: { text: 'launch claude' } }],
      [{ method: 'closeHarnessLaunch', params: {} }],
    ]);
  });

  it('sends nothing on Enter when canSubmit rejects the fields', () => {
    const { client, send } = makeClient();
    render(<Dialog client={client} canSubmit={() => false} />);

    fireEvent.keyDown(document, { key: 'Enter' });

    expect(send).not.toHaveBeenCalled();
  });

  it('focuses the submit button on mount when a remembered selection was restored', () => {
    const { client } = makeClient();
    render(<Dialog client={client} hadRemembered />);

    expect(screen.getByRole('button', { name: 'Create' })).toHaveFocus();
  });

  it('leaves the submit button unfocused when nothing was remembered', () => {
    const { client } = makeClient();
    render(<Dialog client={client} />);

    expect(screen.getByRole('button', { name: 'Create' })).not.toHaveFocus();
  });
});
