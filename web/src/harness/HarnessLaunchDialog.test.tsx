import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HarnessLaunchView } from '@shared/protocol';
import type { JanusClient } from '../shared/ws/ws';
import { HarnessLaunchDialog, resetHarnessLaunchDialogMemory } from './HarnessLaunchDialog';

const view: HarnessLaunchView = {
  names: ['claude', 'opencode', 'codex'],
  models: { claude: ['opus', 'sonnet'], opencode: ['opencode-go/glm-5.2'], codex: [] },
  autoApprove: ['claude', 'codex'],
  autoResume: ['opencode', 'codex'],
  roleEntries: [[{ harness: 'claude', model: 'sonnet' }]],
};

function makeClient() {
  const send = vi.fn();
  return { client: { send } as unknown as JanusClient, send };
}

function renderDialog(launchView: HarnessLaunchView = view) {
  const { client, send } = makeClient();
  const utils = render(<HarnessLaunchDialog view={launchView} client={client} />);
  return { ...utils, client, send };
}

const modelList = (container: HTMLElement) => container.querySelector('.model-search-list');
const modelRows = (container: HTMLElement) =>
  [...container.querySelectorAll('.model-search-row:not(.model-search-muted)')];
const highlightedRow = (container: HTMLElement) => container.querySelector('.model-search-row.highlighted');

beforeEach(() => resetHarnessLaunchDialogMemory());

describe('HarnessLaunchDialog', () => {
  it('defaults workspace and supported auto-approve on', () => {
    const { getByLabelText } = renderDialog();
    expect((getByLabelText(/Workspace/) as HTMLInputElement).checked).toBe(true);
    expect((getByLabelText(/Auto-approve/) as HTMLInputElement).checked).toBe(true);
  });

  it('renders a harness option per delivered name', () => {
    const { container } = renderDialog();
    const options = [...container.querySelectorAll('select')][0].querySelectorAll('option');
    expect([...options].map((o) => o.value)).toEqual(['claude', 'opencode', 'codex']);
  });

  it('enables Auto-approve for claude regardless of the Workspace toggle', () => {
    const { getByLabelText } = renderDialog();
    const auto = getByLabelText(/Auto-approve/) as HTMLInputElement;
    expect(auto.disabled).toBe(false);
    fireEvent.click(getByLabelText(/Workspace/));
    expect((getByLabelText(/Auto-approve/) as HTMLInputElement).disabled).toBe(false);
  });

  it('enables Auto-approve for codex regardless of the Workspace toggle', () => {
    const { getByLabelText, container } = renderDialog();
    fireEvent.change(container.querySelector('select')!, { target: { value: 'codex' } });
    expect((getByLabelText(/Auto-approve/) as HTMLInputElement).disabled).toBe(false);
    fireEvent.click(getByLabelText(/Workspace/));
    expect((getByLabelText(/Auto-approve/) as HTMLInputElement).disabled).toBe(false);
  });

  it('keeps Auto-approve checked when switching between claude and codex', () => {
    const { getByLabelText, container } = renderDialog();
    expect((getByLabelText(/Auto-approve/) as HTMLInputElement).checked).toBe(true);
    fireEvent.change(container.querySelector('select')!, { target: { value: 'codex' } });
    expect((getByLabelText(/Auto-approve/) as HTMLInputElement).checked).toBe(true);
    fireEvent.change(container.querySelector('select')!, { target: { value: 'claude' } });
    expect((getByLabelText(/Auto-approve/) as HTMLInputElement).checked).toBe(true);
  });

  it('clears and disables Auto-approve when switching to opencode', () => {
    const { getByLabelText, container } = renderDialog();
    fireEvent.click(getByLabelText(/Workspace/));
    fireEvent.click(getByLabelText(/Auto-approve/));
    fireEvent.change(container.querySelector('select')!, { target: { value: 'opencode' } });
    const auto = getByLabelText(/Auto-approve/) as HTMLInputElement;
    expect(auto.disabled).toBe(true);
    expect(auto.checked).toBe(false);
  });

  it('renders the claude-and-codex auto-approve label', () => {
    const { getByText } = renderDialog();
    expect(getByText(/Auto-approve \(-y\) — claude and codex only/)).toBeTruthy();
  });

  it('offers Auto-approve for exactly the harnesses the delivered catalog lists', () => {
    const { getByLabelText, getByText, container } = renderDialog({ ...view, autoApprove: ['claude', 'opencode', 'codex'] });
    fireEvent.change(container.querySelector('select')!, { target: { value: 'opencode' } });
    const auto = getByLabelText(/Auto-approve/) as HTMLInputElement;
    expect(auto.disabled).toBe(false);
    expect(auto.checked).toBe(true);
    expect(getByText(/Auto-approve \(-y\) — claude, opencode, and codex only/)).toBeTruthy();
  });

  it('defaults Auto-approve off and disabled when the catalog lists no harness for it', () => {
    const { getByLabelText } = renderDialog({ ...view, autoApprove: [] });
    const auto = getByLabelText(/Auto-approve/) as HTMLInputElement;
    expect(auto.disabled).toBe(true);
    expect(auto.checked).toBe(false);
  });

  it('submits an explicit opt-out when codex auto-approve is unchecked', () => {
    const { getByText, getByLabelText, container, send } = renderDialog();
    fireEvent.change(container.querySelector('select')!, { target: { value: 'codex' } });
    fireEvent.click(getByLabelText(/Auto-approve/));
    fireEvent.click(getByText('Create'));
    expect(send).toHaveBeenNthCalledWith(1, {
      method: 'command', params: { text: 'harness codex --no-auto-approve' },
    });
  });

  it('offers Auto-resume for exactly the harnesses the delivered catalog lists', () => {
    const { getByLabelText, getByText, container } = renderDialog();
    fireEvent.change(container.querySelector('select')!, { target: { value: 'codex' } });
    const resume = getByLabelText(/Auto-resume/) as HTMLInputElement;
    expect(resume.disabled).toBe(false);
    expect(resume.checked).toBe(true);
    expect(getByText(/Auto-resume \(--auto-resume\) — opencode and codex only/)).toBeTruthy();
  });

  it('offers Auto-resume for each harness the catalog lists, not only the first', () => {
    const { getByLabelText, container } = renderDialog();
    const select = container.querySelector('select')!;
    for (const name of view.autoResume) {
      fireEvent.change(select, { target: { value: name } });
      const resume = getByLabelText(/Auto-resume/) as HTMLInputElement;
      expect(resume.disabled).toBe(false);
      expect(resume.checked).toBe(true);
    }
  });

  it('disables and clears Auto-resume for a harness with no limit detector', () => {
    const { getByLabelText, container } = renderDialog({ ...view, autoResume: ['opencode', 'codex'] });
    fireEvent.change(container.querySelector('select')!, { target: { value: 'codex' } });
    fireEvent.click(getByLabelText(/Auto-resume/));
    fireEvent.change(container.querySelector('select')!, { target: { value: 'claude' } });
    const resume = getByLabelText(/Auto-resume/) as HTMLInputElement;
    expect(resume.disabled).toBe(true);
    expect(resume.checked).toBe(false);
  });

  it('defaults Auto-resume off and disabled when the catalog lists no harness for it', () => {
    const { getByLabelText } = renderDialog({ ...view, autoResume: [] });
    const resume = getByLabelText(/Auto-resume/) as HTMLInputElement;
    expect(resume.disabled).toBe(true);
    expect(resume.checked).toBe(false);
  });

  it('submits --no-auto-resume when a recognized harness has it unchecked', () => {
    const { getByText, getByLabelText, container, send } = renderDialog();
    fireEvent.change(container.querySelector('select')!, { target: { value: 'codex' } });
    fireEvent.click(getByLabelText(/Auto-resume/));
    fireEvent.click(getByText('Create'));
    expect(send).toHaveBeenNthCalledWith(1, {
      method: 'command', params: { text: 'harness codex --no-auto-resume' },
    });
  });

  it('submits nothing extra for auto-resume while it is on, since that is the default', () => {
    const { getByText, container, send } = renderDialog();
    fireEvent.change(container.querySelector('select')!, { target: { value: 'codex' } });
    fireEvent.click(getByText('Create'));
    expect(send).toHaveBeenNthCalledWith(1, { method: 'command', params: { text: 'harness codex' } });
  });

  it('disables the Model input for a harness with an empty catalog (codex)', () => {
    const { getByLabelText, container } = renderDialog();
    const model = () => getByLabelText('Model') as HTMLInputElement;
    expect(model().disabled).toBe(false); // claude has models
    fireEvent.change(container.querySelector('select')!, { target: { value: 'codex' } });
    expect(model().disabled).toBe(true);
  });

  it('Create submits the composed command and closes the dialog', () => {
    const { getByText, getByLabelText, send } = renderDialog();
    fireEvent.click(getByLabelText(/Workspace/));
    fireEvent.click(getByLabelText(/Auto-approve/));
    fireEvent.change(getByLabelText('Model'), { target: { value: 'sonnet' } });
    fireEvent.click(getByText('Create'));
    expect(send).toHaveBeenNthCalledWith(1, {
      method: 'command',
      params: { text: 'harness claude --no-workspace --no-auto-approve --no-auto-resume --model sonnet' },
    });
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
    expect((second.getByLabelText(/Workspace/) as HTMLInputElement).checked).toBe(false);
  });

  it('does not focus the Create button on a fresh dialog with no remembered settings', () => {
    const { getByText } = renderDialog();
    expect(document.activeElement).not.toBe(getByText('Create'));
  });

  it('focuses the Create button when reopened with remembered settings', () => {
    const first = renderDialog();
    fireEvent.click(first.getByLabelText(/Workspace/));
    first.unmount();

    const second = renderDialog();
    expect(document.activeElement).toBe(second.getByText('Create'));
  });

  it('Effort dropdown lists the five supported levels plus a default option', () => {
    const { getByLabelText } = renderDialog();
    const options = getByLabelText(/Effort/).querySelectorAll('option');
    expect([...options].map((o) => o.value)).toEqual(['', 'low', 'medium', 'high', 'xhigh', 'max']);
  });

  it('selecting an effort level includes --effort in the built command', () => {
    const { getByText, getByLabelText, send } = renderDialog();
    fireEvent.change(getByLabelText(/Effort/), { target: { value: 'high' } });
    fireEvent.click(getByText('Create'));
    expect(send).toHaveBeenNthCalledWith(1, { method: 'command', params: { text: 'harness claude --no-auto-resume --effort high' } });
  });

  it('renders the E2E browser checkbox, defaulted on', () => {
    const { getByLabelText } = renderDialog();
    expect((getByLabelText(/E2E browser/) as HTMLInputElement).checked).toBe(true);
  });

  // Unlike auto-approve, every harness accepts the browser, so the control is never disabled.
  it('leaves the E2E browser checkbox enabled for every harness', () => {
    const { getByLabelText, container } = renderDialog();
    for (const name of ['claude', 'opencode', 'codex']) {
      fireEvent.change(container.querySelector('select')!, { target: { value: name } });
      expect((getByLabelText(/E2E browser/) as HTMLInputElement).disabled).toBe(false);
    }
  });

  it('unchecking the E2E browser checkbox appends --no-browser to the built command', () => {
    const { getByText, getByLabelText, send } = renderDialog();
    fireEvent.click(getByLabelText(/E2E browser/));
    fireEvent.click(getByText('Create'));
    expect(send).toHaveBeenNthCalledWith(1, { method: 'command', params: { text: 'harness claude --no-browser --no-auto-resume' } });
  });

  it('remembers the E2E browser checkbox across reopen', () => {
    const first = renderDialog();
    fireEvent.click(first.getByLabelText(/E2E browser/));
    first.unmount();

    const second = renderDialog();
    expect((second.getByLabelText(/E2E browser/) as HTMLInputElement).checked).toBe(false);
  });

  it('renders the MCP server checkbox, defaulted on', () => {
    const { getByLabelText } = renderDialog();
    expect((getByLabelText(/MCP server/) as HTMLInputElement).checked).toBe(true);
  });

  it('unchecking the MCP server checkbox appends --no-mcp to the built command', () => {
    const { getByText, getByLabelText, send } = renderDialog();
    fireEvent.click(getByLabelText(/MCP server/));
    fireEvent.click(getByText('Create'));
    expect(send).toHaveBeenNthCalledWith(1, {
      method: 'command', params: { text: 'harness claude --no-mcp --no-auto-resume' },
    });
  });

  it('checking Offline clears and disables the MCP server checkbox', () => {
    const { getByLabelText } = renderDialog();
    fireEvent.click(getByLabelText(/Offline/));
    const mcp = getByLabelText(/MCP server/) as HTMLInputElement;
    expect(mcp.checked).toBe(false);
    expect(mcp.disabled).toBe(true);
  });

  it('unchecking Offline re-enables and rechecks the MCP server checkbox', () => {
    const { getByLabelText } = renderDialog();
    const offline = getByLabelText(/Offline/);
    fireEvent.click(offline);
    fireEvent.click(offline);
    const mcp = getByLabelText(/MCP server/) as HTMLInputElement;
    expect(mcp.disabled).toBe(false);
    expect(mcp.checked).toBe(true);
  });

  it('adds no --no-mcp to an offline command even when the MCP checkbox was cleared', () => {
    const { getByText, getByLabelText, send } = renderDialog();
    fireEvent.click(getByLabelText(/MCP server/));
    fireEvent.click(getByLabelText(/Offline/));
    fireEvent.click(getByText('Create'));
    expect(send).toHaveBeenNthCalledWith(1, {
      method: 'command', params: { text: 'harness claude --offline --no-auto-resume' },
    });
  });

  it('builds no --model for blank or whitespace-only text', () => {
    const { getByText, getByLabelText, send } = renderDialog();
    fireEvent.click(getByText('Create'));
    expect(send).toHaveBeenNthCalledWith(1, { method: 'command', params: { text: 'harness claude --no-auto-resume' } });
    send.mockClear();

    fireEvent.change(getByLabelText('Model'), { target: { value: ' '.repeat(3) } });
    fireEvent.click(getByText('Create'));
    expect(send).toHaveBeenNthCalledWith(1, { method: 'command', params: { text: 'harness claude --no-auto-resume' } });
  });

  it('builds --model with the trimmed id when an exact id has surrounding spaces', () => {
    const { getByText, getByLabelText, send } = renderDialog();
    fireEvent.change(getByLabelText('Model'), { target: { value: '  sonnet  ' } });
    fireEvent.click(getByText('Create'));
    expect(send).toHaveBeenNthCalledWith(1, {
      method: 'command', params: { text: 'harness claude --no-auto-resume --model sonnet' },
    });
  });

  it('disables Create for partial text and never submits it on Return', () => {
    const { getByText, getByLabelText, send } = renderDialog();
    const model = getByLabelText('Model');
    fireEvent.change(model, { target: { value: 'son' } });
    expect((getByText('Create') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(document, { key: 'Enter' });
    fireEvent.keyDown(model, { key: 'Escape' });
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ method: 'command' }));
  });

  it('Escape with the dropdown open closes only the list, and Escape with it closed cancels', () => {
    const { container, getByLabelText, send } = renderDialog();
    const model = getByLabelText('Model');
    fireEvent.focus(model);
    expect(modelList(container)).not.toBeNull();

    fireEvent.keyDown(model, { key: 'Escape' });
    expect(modelList(container)).toBeNull();
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ method: 'closeHarnessLaunch' }));

    fireEvent.keyDown(model, { key: 'Escape' });
    expect(send).toHaveBeenCalledWith({ method: 'closeHarnessLaunch', params: {} });
  });

  it('Return with a highlighted row fills the id instead of creating, and a second Return creates', () => {
    const { container, getByLabelText, send } = renderDialog();
    const model = getByLabelText('Model');
    fireEvent.focus(model);
    fireEvent.change(model, { target: { value: 'son' } });
    expect(highlightedRow(container)?.textContent).toBe('sonnet');

    fireEvent.keyDown(model, { key: 'Enter' });
    expect(model).toHaveValue('sonnet');
    expect(modelList(container)).toBeNull();
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ method: 'command' }));

    fireEvent.keyDown(document, { key: 'Enter' });
    expect(send).toHaveBeenNthCalledWith(1, {
      method: 'command', params: { text: 'harness claude --no-auto-resume --model sonnet' },
    });
  });

  it('Return on a focused blank Model field creates with the default model', () => {
    const { container, getByLabelText, send } = renderDialog();
    const model = getByLabelText('Model');
    fireEvent.focus(model);
    expect(modelList(container)).not.toBeNull();
    expect(highlightedRow(container)).toBeNull();

    fireEvent.keyDown(model, { key: 'Enter' });
    expect(send).toHaveBeenNthCalledWith(1, { method: 'command', params: { text: 'harness claude --no-auto-resume' } });
  });

  it('keeps a model the new harness has and clears one it does not on a harness change', () => {
    const shared: HarnessLaunchView = {
      ...view,
      models: { claude: ['opus', 'shared'], opencode: ['shared', 'glm'], codex: [] },
    };
    const { container, getByLabelText } = renderDialog(shared);
    const model = getByLabelText('Model');
    const harness = container.querySelector('select')!;

    fireEvent.change(model, { target: { value: 'shared' } });
    fireEvent.change(harness, { target: { value: 'opencode' } });
    expect(model).toHaveValue('shared');

    fireEvent.change(model, { target: { value: 'opus' } });
    fireEvent.change(harness, { target: { value: 'codex' } });
    expect(model).toHaveValue('');
  });

  it('restores a remembered model that is still in the catalog and clears one that is not', () => {
    const first = renderDialog();
    fireEvent.change(first.getByLabelText('Model'), { target: { value: 'sonnet' } });
    first.unmount();

    const second = renderDialog();
    expect(second.getByLabelText('Model')).toHaveValue('sonnet');
    second.unmount();

    const withoutSonnet: HarnessLaunchView = { ...view, models: { ...view.models, claude: ['opus'] } };
    const third = renderDialog(withoutSonnet);
    expect(third.getByLabelText('Model')).toHaveValue('');
    expect((third.getByText('Create') as HTMLButtonElement).disabled).toBe(false);
  });

  it('keeps typed text but disables Create when a new view drops the id from the catalog', () => {
    const withoutSonnet: HarnessLaunchView = { ...view, models: { ...view.models, claude: ['opus'] } };
    const { getByLabelText, getByText, rerender, client } = renderDialog();
    fireEvent.change(getByLabelText('Model'), { target: { value: 'sonnet' } });
    expect((getByText('Create') as HTMLButtonElement).disabled).toBe(false);

    rerender(<HarnessLaunchDialog view={withoutSonnet} client={client} />);
    expect(getByLabelText('Model')).toHaveValue('sonnet');
    expect((getByText('Create') as HTMLButtonElement).disabled).toBe(true);
  });

  it('lists the models the roles use most in the blank dropdown', () => {
    const withRoles: HarnessLaunchView = {
      ...view,
      roleEntries: [[
        { harness: 'claude', model: 'sonnet' },
        { harness: 'claude', model: 'opus' },
        { harness: 'opencode', model: 'sonnet' },
      ]],
    };
    const { container, getByLabelText } = renderDialog(withRoles);
    fireEvent.focus(getByLabelText('Model'));
    expect(modelRows(container).map((row) => row.textContent)).toEqual(['sonnet', 'opus']);
  });

  it('keeps the Model accessible name while the dropdown is open', () => {
    const { container, getByLabelText } = renderDialog();
    fireEvent.focus(getByLabelText('Model'));
    expect(modelList(container)).not.toBeNull();
    expect(getByLabelText('Model')).toBeInstanceOf(HTMLInputElement);
  });
});
