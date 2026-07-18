import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ScheduleLaunchView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { ScheduleDialog, resetScheduleDialogMemory } from './ScheduleDialog';

const view: ScheduleLaunchView = { targets: ['janus', 'claude'], active: 'janus' };

function makeClient() {
  const send = vi.fn();
  return { client: { send } as unknown as JanusClient, send };
}

function renderDialog(customView: ScheduleLaunchView = view) {
  const { client, send } = makeClient();
  const utils = render(<ScheduleDialog view={customView} client={client} />);
  return { ...utils, send };
}

beforeEach(() => resetScheduleDialogMemory());

describe('ScheduleDialog', () => {
  it('renders a target option per delivered tab, defaulting to the active tab', () => {
    const { container } = renderDialog();
    const targetSelect = [...container.querySelectorAll('select')][0] as HTMLSelectElement;
    expect([...targetSelect.querySelectorAll('option')].map((o) => o.value)).toEqual(['janus', 'claude']);
    expect(targetSelect.value).toBe('janus');
  });

  it('shows the date field only for the `on` type', () => {
    const { container, getByLabelText } = renderDialog();
    expect(container.querySelector('input[placeholder="aug 12"]')).toBeNull();
    fireEvent.change(getByLabelText(/Schedule type/), { target: { value: 'on' } });
    expect(container.querySelector('input[placeholder="aug 12"]')).not.toBeNull();
  });

  it('shows the interval field only for the `every` type, and hides the Time field', () => {
    const { container, getByLabelText, queryByLabelText } = renderDialog();
    fireEvent.change(getByLabelText(/Schedule type/), { target: { value: 'every' } });
    expect(container.querySelector('input[placeholder="5m"]')).not.toBeNull();
    expect(queryByLabelText(/Time/)).toBeNull();
  });

  it('shows the weekday field only for the `everyWeekday` type', () => {
    const { getByLabelText, queryByLabelText } = renderDialog();
    expect(queryByLabelText(/Weekday/)).toBeNull();
    fireEvent.change(getByLabelText(/Schedule type/), { target: { value: 'everyWeekday' } });
    expect(getByLabelText(/Weekday/)).not.toBeNull();
  });

  it('Schedule is disabled until name, command, and the type-specific field are present', () => {
    const { getByText, getByLabelText } = renderDialog();
    const button = getByText('Schedule') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(getByLabelText('Name'), { target: { value: 'fetch' } });
    fireEvent.change(getByLabelText('Command'), { target: { value: 'echo hi' } });
    expect(button.disabled).toBe(true);
    fireEvent.change(getByLabelText(/Time/), { target: { value: '3pm' } });
    expect(button.disabled).toBe(false);
  });

  it('Schedule submits the composed command and closes the dialog', () => {
    const { getByText, getByLabelText, send } = renderDialog();
    fireEvent.change(getByLabelText('Name'), { target: { value: 'fetch' } });
    fireEvent.change(getByLabelText('Command'), { target: { value: 'echo hi' } });
    fireEvent.change(getByLabelText(/Time/), { target: { value: '3pm' } });
    fireEvent.click(getByText('Schedule'));
    expect(send).toHaveBeenNthCalledWith(1, { method: 'command', params: { text: 'schedule fetch at 3pm echo hi' } });
    expect(send).toHaveBeenNthCalledWith(2, { method: 'closeScheduleLaunch', params: {} });
  });

  it('assembles an `in TAB` clause when a non-active target is chosen', () => {
    const { getByText, getByLabelText, send } = renderDialog();
    fireEvent.change(getByLabelText('Name'), { target: { value: 'fetch' } });
    fireEvent.change(getByLabelText('Command'), { target: { value: 'echo hi' } });
    fireEvent.change(getByLabelText(/Time/), { target: { value: '3pm' } });
    fireEvent.change(getByLabelText(/Target tab/), { target: { value: 'claude' } });
    fireEvent.click(getByText('Schedule'));
    expect(send).toHaveBeenNthCalledWith(1, { method: 'command', params: { text: 'schedule fetch in claude at 3pm echo hi' } });
  });

  it('Cancel closes the dialog without submitting a command', () => {
    const { getByText, send } = renderDialog();
    fireEvent.click(getByText('Cancel'));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ method: 'closeScheduleLaunch', params: {} });
  });

  it('Escape closes the dialog without submitting a command', () => {
    const { send } = renderDialog();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(send).toHaveBeenCalledWith({ method: 'closeScheduleLaunch', params: {} });
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ method: 'command' }));
  });

  it('restores the previous selections when reopened within the run', () => {
    const first = renderDialog();
    fireEvent.change(first.getByLabelText('Name'), { target: { value: 'fetch' } });
    fireEvent.change(first.getByLabelText(/Target tab/), { target: { value: 'claude' } });
    first.unmount();

    const second = renderDialog();
    expect((second.getByLabelText('Name') as HTMLInputElement).value).toBe('fetch');
    expect((second.getByLabelText(/Target tab/) as HTMLSelectElement).value).toBe('claude');
  });

  it('does not focus the Schedule button on a fresh dialog with no remembered settings', () => {
    const { getByText } = renderDialog();
    expect(document.activeElement).not.toBe(getByText('Schedule'));
  });

  it('focuses the Schedule button when reopened with remembered settings', () => {
    const first = renderDialog();
    fireEvent.change(first.getByLabelText('Name'), { target: { value: 'fetch' } });
    fireEvent.change(first.getByLabelText('Command'), { target: { value: 'echo hi' } });
    fireEvent.change(first.getByLabelText(/Time/), { target: { value: '3pm' } });
    first.unmount();

    const second = renderDialog();
    expect(document.activeElement).toBe(second.getByText('Schedule'));
  });
});
