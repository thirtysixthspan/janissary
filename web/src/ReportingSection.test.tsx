import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import { ReportingSection, isReportingTab, type ReportingEntry } from './ReportingSection';

function makeEntry(label: string, index: number, suggestions: { id: string; text: string; command?: string }[] = []): ReportingEntry {
  return {
    tab: {
      label,
      view: 'monitor' as const,
      dotColor: '#ff0',
      groupColor: '#ccc',
      title: undefined as string | undefined,
      monitor: { suggestions: suggestions.map((s) => ({ ...s, timestamp: 0, persona: '', about: '' })) },
    } as never,
    index,
  };
}

describe('isReportingTab', () => {
  it('returns true for monitor tabs', () => {
    expect(isReportingTab({ view: 'monitor' } as never)).toBe(true);
  });

  it('returns false for non-monitor tabs', () => {
    expect(isReportingTab({ view: 'agent' } as never)).toBe(false);
  });
});

describe('ReportingSection', () => {
  it('returns null when entries is empty', () => {
    const { container } = render(
      React.createElement(ReportingSection, { entries: [], onClose: vi.fn(), onRun: vi.fn(), onRate: vi.fn(), onReset: vi.fn(), onSnapshot: vi.fn() }),
    );
    expect(container.querySelector('.reporting-section')).toBeNull();
  });

  it('renders tab labels for entries', () => {
    const { getByText } = render(
      React.createElement(ReportingSection, {
        entries: [makeEntry('alerts', 0), makeEntry('log', 1)],
        onClose: vi.fn(), onRun: vi.fn(), onRate: vi.fn(), onReset: vi.fn(), onSnapshot: vi.fn(),
      }),
    );
    expect(getByText('alerts')).toBeTruthy();
    expect(getByText('log')).toBeTruthy();
  });

  it('renders the MonitorTab for the selected entry', () => {
    const { getByText } = render(
      React.createElement(ReportingSection, {
        entries: [makeEntry('alerts', 0, [{ id: 's1', text: 'watch the builds' }])],
        onClose: vi.fn(), onRun: vi.fn(), onRate: vi.fn(), onReset: vi.fn(), onSnapshot: vi.fn(),
      }),
    );
    expect(getByText('watch the builds')).toBeTruthy();
  });

  it('reset button calls onReset with the current tab\'s label', () => {
    const onReset = vi.fn();
    const { container } = render(
      React.createElement(ReportingSection, {
        entries: [makeEntry('alerts', 0)],
        onClose: vi.fn(), onRun: vi.fn(), onRate: vi.fn(), onReset, onSnapshot: vi.fn(),
      }),
    );
    fireEvent.click(container.querySelector('.monitor-reset')!);
    expect(onReset).toHaveBeenCalledWith('alerts');
  });

  it('snapshot button calls onSnapshot with the current tab\'s label', () => {
    const onSnapshot = vi.fn();
    const { container } = render(
      React.createElement(ReportingSection, {
        entries: [makeEntry('alerts', 0)],
        onClose: vi.fn(), onRun: vi.fn(), onRate: vi.fn(), onReset: vi.fn(), onSnapshot,
      }),
    );
    fireEvent.click(container.querySelector('.monitor-snapshot')!);
    expect(onSnapshot).toHaveBeenCalledWith('alerts');
  });

  it('clicking a different tab selects it', () => {
    const { container } = render(
      React.createElement(ReportingSection, {
        entries: [makeEntry('alerts', 0), makeEntry('log', 1)],
        onClose: vi.fn(), onRun: vi.fn(), onRate: vi.fn(), onReset: vi.fn(), onSnapshot: vi.fn(),
      }),
    );
    const tabs = container.querySelectorAll(':scope .reporting-strip .tab');
    fireEvent.click(tabs[1]);
    expect(tabs[1].classList.contains('active')).toBe(true);
  });

  it('close button calls onClose with the entry index', () => {
    const onClose = vi.fn();
    const { container } = render(
      React.createElement(ReportingSection, {
        entries: [makeEntry('alerts', 5)],
        onClose, onRun: vi.fn(), onRate: vi.fn(), onReset: vi.fn(), onSnapshot: vi.fn(),
      }),
    );
    fireEvent.click(container.querySelector('.tab-close')!);
    expect(onClose).toHaveBeenCalledWith(5);
  });

  it('close button calls onClose without changing selection', () => {
    const onClose = vi.fn();
    const { container } = render(
      React.createElement(ReportingSection, {
        entries: [makeEntry('alerts', 0), makeEntry('log', 1)],
        onClose, onRun: vi.fn(), onRate: vi.fn(), onReset: vi.fn(), onSnapshot: vi.fn(),
      }),
    );
    const tabs = container.querySelectorAll(':scope .reporting-strip .tab');
    fireEvent.click(tabs[1]);
    fireEvent.click(tabs[1].querySelector(':scope .tab-close')!);
    expect(onClose).toHaveBeenCalledWith(1);
  });

  it('divider mouseup removes listeners', () => {
    const removeSpy = vi.spyOn(globalThis, 'removeEventListener');
    const { container } = render(
      React.createElement(ReportingSection, {
        entries: [makeEntry('alerts', 0)],
        onClose: vi.fn(), onRun: vi.fn(), onRate: vi.fn(), onReset: vi.fn(), onSnapshot: vi.fn(),
      }),
    );
    const divider = container.querySelector('.reporting-resize')!;
    fireEvent.mouseDown(divider);
    fireEvent.mouseUp(divider);
    expect(removeSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));
    removeSpy.mockRestore();
  });
});
