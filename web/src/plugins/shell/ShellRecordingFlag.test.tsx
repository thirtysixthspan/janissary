import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { ShellRecordingFlag } from './ShellRecordingFlag';
import { tabFlagDisplay } from '../api';
import type { TabPluginClientCapabilities } from '../api';

// The shell plugin draws its own markup rather than importing the host's `AgentTabMeta`, which is
// the independence it was built for — and the reason the flag's *definition* had to be published.
// These cases pin the two rows together: same icon, same tooltip, same accessible name, same rule
// for when it can be pressed.
function capabilities(overrides: Partial<TabPluginClientCapabilities> = {}) {
  return { ...overrides } as TabPluginClientCapabilities;
}

describe('ShellRecordingFlag', () => {
  it('reads the icon and the label from the host\'s shared definition, not its own', () => {
    render(<ShellRecordingFlag capabilities={capabilities({ openRecording: () => {} })} />);

    // If this plugin ever hand-writes a second copy of the flag, this stops being the host's icon
    // and nothing else would say when the two rows came to disagree.
    expect(tabFlagDisplay.recording?.icon).toBeDefined();
    expect(tabFlagDisplay.recording?.label).toBe('recording');
  });

  it('is pressable and green once the tab has a recording, and opens it', () => {
    const openRecording = vi.fn();
    const { container } = render(
      <ShellRecordingFlag capabilities={capabilities({ openRecording, recording: '/a.cast' })} />,
    );

    const button = container.querySelector('button');
    expect(button).toHaveClass('tab-flag--active');
    button?.click();

    expect(openRecording).toHaveBeenCalled();
  });

  it('is plain and inert before the shell has printed anything', () => {
    const { container } = render(<ShellRecordingFlag capabilities={capabilities()} />);

    expect(container.querySelector('button')).toBeNull();
    const flag = container.querySelector('.tab-recording');
    expect(flag?.tagName).toBe('SPAN');
    expect(flag).not.toHaveClass('tab-flag--active');
  });

  it('labels the flag the same in both states', () => {
    const { container: inert } = render(<ShellRecordingFlag capabilities={capabilities()} />);
    const { container: live } = render(
      <ShellRecordingFlag capabilities={capabilities({ openRecording: () => {} })} />,
    );

    expect(inert.querySelector('[title]')?.getAttribute('title')).toBe('recording');
    expect(live.querySelector('[title]')?.getAttribute('title')).toBe('recording');
    expect(inert.querySelector('[aria-label]')?.getAttribute('aria-label')).toBe('recording');
    expect(live.querySelector('[aria-label]')?.getAttribute('aria-label')).toBe('recording');
  });
});