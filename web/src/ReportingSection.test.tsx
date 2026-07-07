import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import { ReportingSection, isReportingTab } from './ReportingSection';

function makeEntry(label: string, index: number, suggestions: { id: string; text: string; command?: string }[] = []) {
  return {
    tab: {
      label,
      view: 'monitor' as const,
      dotColor: '#ff0',
      groupColor: '#ccc',
      title: undefined as string | undefined,
      monitor: { suggestions: suggestions.map((s) => ({ ...s, timestamp: 0, persona: '', about: '' })) },
    },
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
      React.createElement(ReportingSection, { entries: [], onClose: vi.fn(), onRun: vi.fn(), onRate: vi.fn() }),
    );
    expect(container.querySelector('.reporting-section')).toBeNull();
  });

  it('renders tab labels for entries', () => {
    const { getByText } = render(
      React.createElement(ReportingSection, {
        entries: [makeEntry('alerts', 0), makeEntry('log', 1)],
        onClose: vi.fn(), onRun: vi.fn(), onRate: vi.fn(),
      }),
    );
    expect(getByText('alerts')).toBeTruthy();
    expect(getByText('log')).toBeTruthy();
  });

  it('renders the MonitorTab for the selected entry', () => {
    const { getByText } = render(
      React.createElement(ReportingSection, {
        entries: [makeEntry('alerts', 0, [{ id: 's1', text: 'watch the builds' }])],
        onClose: vi.fn(), onRun: vi.fn(), onRate: vi.fn(),
      }),
    );
    expect(getByText('watch the builds')).toBeTruthy();
  });

  it('clicking a different tab selects it', () => {
    const { container } = render(
      React.createElement(ReportingSection, {
        entries: [makeEntry('alerts', 0), makeEntry('log', 1)],
        onClose: vi.fn(), onRun: vi.fn(), onRate: vi.fn(),
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
        onClose, onRun: vi.fn(), onRate: vi.fn(),
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
        onClose, onRun: vi.fn(), onRate: vi.fn(),
      }),
    );
    const tabs = container.querySelectorAll(':scope .reporting-strip .tab');
    fireEvent.click(tabs[1]);
    fireEvent.click(tabs[1].querySelector(':scope .tab-close')!);
    expect(onClose).toHaveBeenCalledWith(1);
  });

  it('divider drag calls addEventListener on mousedown', () => {
    const addSpy = vi.spyOn(globalThis, 'addEventListener');
    const { container } = render(
      React.createElement(ReportingSection, {
        entries: [makeEntry('alerts', 0)],
        onClose: vi.fn(), onRun: vi.fn(), onRate: vi.fn(),
      }),
    );
    const divider = container.querySelector('.reporting-resize')!;
    fireEvent.mouseDown(divider);
    expect(addSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));
    addSpy.mockRestore();
  });
});
