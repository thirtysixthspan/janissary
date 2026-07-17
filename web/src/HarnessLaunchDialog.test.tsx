import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HarnessLaunchView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { HarnessLaunchDialog, resetHarnessLaunchDialogMemory } from './HarnessLaunchDialog';

const view: HarnessLaunchView = {
  names: ['claude', 'opencode', 'codex'],
  models: { claude: ['opus', 'sonnet'], opencode: ['opencode-go/glm-5.2'], codex: [] },
};

function makeClient() {
  const send = vi.fn();
  return { client: { send } as unknown as JanusClient, send };
}

function renderDialog() {
  const { client, send } = makeClient();
  const utils = render(<HarnessLaunchDialog view={view} client={client} />);
  return { ...utils, send };
}

beforeEach(() => resetHarnessLaunchDialogMemory());

describe('HarnessLaunchDialog', () => {
  it('renders a harness option per delivered name', () => {
    const { container } = renderDialog();
    const options = [...container.querySelectorAll('select')][0].querySelectorAll('option');
    expect([...options].map((o) => o.value)).toEqual(['claude', 'opencode', 'codex']);
  });

  it('disables Auto-approve unless the harness is claude AND workspace is on', () => {
    const { getByLabelText } = renderDialog();
    const auto = getByLabelText(/Auto-approve/) as HTMLInputElement;
    expect(auto.disabled).toBe(true); // claude, but workspace off
    fireEvent.click(getByLabelText(/Workspace/));
    expect((getByLabelText(/Auto-approve/) as HTMLInputElement).disabled).toBe(false);
  });

  it('keeps Auto-approve disabled for a non-claude harness even with workspace on', () => {
    const { getByLabelText, container } = renderDialog();
    fireEvent.click(getByLabelText(/Workspace/));
    fireEvent.change(container.querySelector('select')!, { target: { value: 'opencode' } });
    expect((getByLabelText(/Auto-approve/) as HTMLInputElement).disabled).toBe(true);
  });

  it('disables the Model dropdown for a harness with an empty catalog (codex)', () => {
    const { getByLabelText, container } = renderDialog();
    const modelSelect = () => [...container.querySelectorAll('select')][1] as HTMLSelectElement;
    expect(modelSelect().disabled).toBe(false); // claude has models
    fireEvent.change(container.querySelector('select')!, { target: { value: 'codex' } });
    expect(modelSelect().disabled).toBe(true);
    void getByLabelText;
  });

  it('Create submits the composed command and closes the dialog', () => {
    const { getByText, getByLabelText, container, send } = renderDialog();
    fireEvent.click(getByLabelText(/Workspace/));
    fireEvent.click(getByLabelText(/Auto-approve/));
    fireEvent.change([...container.querySelectorAll('select')][1], { target: { value: 'sonnet' } });
    fireEvent.click(getByText('Create'));
    expect(send).toHaveBeenNthCalledWith(1, { method: 'command', params: { text: 'harness claude -w -y --model sonnet' } });
    expect(send).toHaveBeenNthCalledWith(2, { method: 'closeHarnessLaunch', params: {} });
  });

  it('Cancel closes the dialog without submitting a command', () => {
    const { getByText, send } = renderDialog();
    fireEvent.click(getByText('Cancel'));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ method: 'closeHarnessLaunch', params: {} });
  });

  it('Escape closes the dialog without submitting a command', () => {
    const { send } = renderDialog();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(send).toHaveBeenCalledWith({ method: 'closeHarnessLaunch', params: {} });
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ method: 'command' }));
  });

  it('restores the previous selections when reopened within the run', () => {
    const first = renderDialog();
    fireEvent.click(first.getByLabelText(/Workspace/));
    fireEvent.change(first.container.querySelector('select')!, { target: { value: 'opencode' } });
    first.unmount();

    const second = renderDialog();
    expect((second.container.querySelector('select') as HTMLSelectElement).value).toBe('opencode');
    expect((second.getByLabelText(/Workspace/) as HTMLInputElement).checked).toBe(true);
  });
});
