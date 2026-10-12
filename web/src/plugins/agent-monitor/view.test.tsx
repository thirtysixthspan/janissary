import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AgentRunView, TabPluginClientCapabilities } from '../api';
import { AgentMonitor } from './view';

vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });

const run: AgentRunView = {
  id: 'server-owned-id', revision: 4, task: 'task.md', command: 'agent in a tab execute task.md',
  model: 'openai/test', effort: 'high', host: 'Local', workspace: '/work', status: 'Running',
  activity: [{ id: 1, kind: 'agent_thought_chunk', text: 'Planning.' }],
};

function capabilities(intent = vi.fn(async () => null)): TabPluginClientCapabilities {
  return { intent } as unknown as TabPluginClientCapabilities;
}

describe('agent monitor view', () => {
  it('renders the scoped activity projection and requests termination without an id', async () => {
    const intent = vi.fn(async () => null);
    render(<AgentMonitor run={run} capabilities={capabilities(intent)} />);

    expect(screen.getByText('agent in a tab execute task.md')).toBeTruthy();
    expect(screen.getByText((text) => text.includes('agent_thought_chunk') && text.includes('Planning.'))).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Terminate' }));
    expect(intent).toHaveBeenCalledWith('terminate', {});
  });

  it('disables termination after cleanup begins', () => {
    render(<AgentMonitor run={{ ...run, status: 'Cleaning up' }} capabilities={capabilities()} />);

    expect(screen.getByRole('button', { name: 'Terminate' })).toBeDisabled();
  });
});
