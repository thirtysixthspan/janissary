import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ModelRow, ModelsPayload } from '@shared/plugins/models/shared';
import type { TabPluginClientCapabilities } from '../api';
import { ModelsTab } from './ModelsTab';

const ROWS: ModelRow[] = [
  { harness: 'opencode', id: 'google/gemini', name: 'Gemini', disabled: false },
  { harness: 'codex', id: 'gpt-6-sol', name: 'GPT 6 Sol', disabled: true },
];

function capabilities(dock: TabPluginClientCapabilities['dock'] = null) {
  const intent = vi.fn<(name: string, payload: unknown) => Promise<unknown>>(async () => null);
  const value: TabPluginClientCapabilities = {
    resourceUrl: (reference) => reference,
    intent: async <Result,>(name: string, payload: unknown) => intent(name, payload) as Promise<Result>,
    copyText: vi.fn(),
    splitAction: null,
    active: true,
    dock,
    close: vi.fn(),
    reportFailure: vi.fn(),
  };
  return { intent, value };
}

function payload(rows = ROWS, refreshing = false): ModelsPayload {
  return {
    groups: [
      { label: 'Google', rows: rows.filter((row) => row.harness === 'opencode') },
      { label: 'OpenAI', rows: rows.filter((row) => row.harness === 'codex') },
    ],
    refreshing,
  };
}

function renderTab(value: ModelsPayload, capabilitiesValue = capabilities().value) {
  return render(<ModelsTab payload={value} capabilities={capabilitiesValue} />);
}

describe('ModelsTab rendering', () => {
  it('shows provider groups and the four center-table columns', () => {
    const { container } = renderTab(payload());
    expect([...container.querySelectorAll(':scope .models-columns span')].map((node) => node.textContent))
      .toEqual(['Model', 'Name', 'Harness', '']);
    expect([...container.querySelectorAll('.models-group-heading')].map((node) => node.textContent))
      .toEqual(['Google', 'OpenAI']);
    expect(screen.getByText('google/gemini')).toBeInTheDocument();
    expect(screen.getByText('Gemini')).toBeInTheDocument();
    expect(screen.getByText('opencode')).toBeInTheDocument();
  });

  it('shows the empty message without column headings', () => {
    const { container } = renderTab({ groups: [], refreshing: false });
    expect(screen.getByText('No models')).toBeInTheDocument();
    expect(container.querySelector('.models-columns')).toBeNull();
  });

  it('shows an id as the row name when the server supplied its fallback', () => {
    renderTab({
      groups: [{
        label: 'Anthropic',
        rows: [{ harness: 'claude', id: 'claude-4', name: 'claude-4', disabled: false }],
      }],
      refreshing: false,
    });
    expect(screen.getAllByText('claude-4')).toHaveLength(2);
  });

  it('stacks id and actions above name and harness while docked', () => {
    const { container } = renderTab(payload(), capabilities('left').value);
    expect(container.querySelector('.models-tab')).toHaveClass('models-tab-narrow');
    expect(container.querySelector('.models-columns')).toBeNull();
    expect(container.querySelector('.models-row-primary')).toHaveTextContent('google/gemini');
    expect(container.querySelector('.models-row-secondary')).toHaveTextContent('Gemini');
    expect(container.querySelector('.models-row-secondary')).toHaveTextContent('opencode');
  });

  it('dims disabled rows and omits their Delete control', () => {
    const { container } = renderTab(payload());
    const disabled = container.querySelector('[data-disabled="true"]');
    expect(disabled).toHaveClass('models-row-disabled');
    expect(screen.queryByLabelText('Delete gpt-6-sol')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Delete google/gemini')).toBeInTheDocument();
  });
});

describe('ModelsTab controls', () => {
  it('does not refresh on render and disables/spins only while refreshing', () => {
    const idle = capabilities();
    const { rerender } = renderTab(payload(), idle.value);
    expect(idle.intent).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Refresh')).toBeEnabled();
    fireEvent.click(screen.getByLabelText('Refresh'));
    expect(idle.intent).toHaveBeenCalledWith('refresh', {});

    const busy = payload(ROWS, true);
    rerender(<ModelsTab payload={busy} capabilities={idle.value} />);
    expect(screen.getByLabelText('Refresh')).toBeDisabled();
    expect(screen.getByLabelText('Refresh').querySelector('svg')).toHaveClass('fa-spin');
  });

  it('opens the Delete dialog, cancels without action, then confirms the row intent', () => {
    const fixture = capabilities();
    renderTab(payload(), fixture.value);
    fireEvent.click(screen.getByLabelText('Delete google/gemini'));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Delete google/gemini?');
    fireEvent.click(screen.getByText('Cancel', { selector: '.modal-button' }));
    expect(fixture.intent).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('Delete google/gemini'));
    fireEvent.click(screen.getByText('Delete', { selector: '.modal-button' }));
    expect(fixture.intent).toHaveBeenCalledExactlyOnceWith('delete', {
      harness: 'opencode', id: 'google/gemini',
    });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
