import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { TabView } from '@shared/protocol';
import { getPresentSections, resolveCurrentSection, nextSection, useSectionNav } from './useSectionNav';

function makeTab(overrides: Partial<TabView> = {}): TabView {
  return {
    label: 'janus', number: 1, dotColor: '#fff', group: 0, groupColor: '#000',
    busy: false, hasUnread: false, cwd: '/tmp', connections: [], schedule: [],
    bufferLines: [], cmdHistory: [], commandQueue: [], toolStepsExpanded: false,
    ...overrides,
  };
}

describe('getPresentSections', () => {
  it('yields every section, in order, for a full layout', () => {
    const tabs = [
      makeTab({ dock: 'left' }),
      makeTab({ dock: 'right', label: 'right' }),
      makeTab({ view: 'monitor', label: 'monitor' }),
    ];
    expect(getPresentSections(tabs)).toEqual(['left', 'center', 'right', 'reporting']);
  });

  it('always includes center and skips absent sidebars/reporting', () => {
    expect(getPresentSections([makeTab()])).toEqual(['center']);
  });
});

describe('nextSection', () => {
  it('wraps the last present section back to the first', () => {
    expect(nextSection('reporting', ['left', 'center', 'right', 'reporting'])).toBe('left');
  });

  it('advances to the next present section', () => {
    expect(nextSection('left', ['left', 'center', 'right', 'reporting'])).toBe('center');
  });

  it('returns center when the current section is not in the present list', () => {
    expect(nextSection('left', ['center'])).toBe('center');
  });
});

describe('resolveCurrentSection', () => {
  it('returns center when nothing is focused', () => {
    expect(resolveCurrentSection(null)).toBe('center');
  });

  it('returns the reporting section, not the enclosing center, for an element nested inside it', () => {
    document.body.innerHTML = '<div class="app-center"><div class="reporting-section"><button id="target"></button></div></div>';
    const target = document.querySelector('#target');
    expect(resolveCurrentSection(target)).toBe('reporting');
  });

  it('resolves a sidebar element to its side', () => {
    document.body.innerHTML = '<div class="sidebar-left"><button id="target"></button></div>';
    const target = document.querySelector('#target');
    expect(resolveCurrentSection(target)).toBe('left');
  });
});

describe('useSectionNav', () => {
  it('Shift+Tab focuses the next present section and prevents default', () => {
    document.body.innerHTML = '<div class="app-center"></div><div class="reporting-section"><div class="reporting-body" tabindex="0" id="reporting-target"></div></div>';
    const tabs = [makeTab({ view: 'monitor' })];
    const focusCenter = vi.fn();
    renderHook(() => useSectionNav(tabs, focusCenter));

    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(event);

    expect(document.activeElement).toBe(document.querySelector('#reporting-target'));
    expect(event.defaultPrevented).toBe(true);
  });

  it('ignores bare Tab', () => {
    document.body.innerHTML = '<div class="app-center"></div>';
    const focusCenter = vi.fn();
    renderHook(() => useSectionNav([makeTab()], focusCenter));

    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(event);

    expect(focusCenter).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('ignores Ctrl+Tab and Shift+Ctrl+Tab', () => {
    document.body.innerHTML = '<div class="app-center"></div>';
    const focusCenter = vi.fn();
    renderHook(() => useSectionNav([makeTab()], focusCenter));

    const ctrlEvent = new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(ctrlEvent);
    const shiftCtrlEvent = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, ctrlKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(shiftCtrlEvent);

    expect(focusCenter).not.toHaveBeenCalled();
  });

  it('focusing a sidebar via section nav does not emit any client RPC', () => {
    document.body.innerHTML = '<div class="app-center"></div><div class="sidebar-left"><div class="files-tab" tabindex="0" id="files-target"></div></div>';
    const tabs = [makeTab({ dock: 'left', view: 'files' })];
    const focusCenter = vi.fn();
    renderHook(() => useSectionNav(tabs, focusCenter));

    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(event);

    expect(document.activeElement).toBe(document.querySelector('#files-target'));
    expect(focusCenter).not.toHaveBeenCalled();
  });

  it('is a no-op when center is the only present section', () => {
    document.body.innerHTML = '<div class="app-center"></div>';
    const focusCenter = vi.fn();
    renderHook(() => useSectionNav([makeTab()], focusCenter));

    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(event);

    expect(focusCenter).toHaveBeenCalledTimes(1);
  });
});
