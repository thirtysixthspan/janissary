import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RecordingFlag } from './RecordingFlag';
import { tabFlagDisplay } from './tab/flag-display';

// The one flag in a metadata row that is also a control. Both rows that draw it render this one
// component, so these cases are what keeps the host's own and the shell plugin's from coming to
// differ over when the flag is lit, what it is called, and whether it can be pressed at all.
describe('RecordingFlag', () => {
  it('reads its icon and its label from the shared flag table', () => {
    render(<RecordingFlag onOpen={() => {}} />);

    // The definition lives in one place so a change to it reaches every row; these are the two
    // things a row would have to get right on its own if it hand-wrote the flag.
    expect(tabFlagDisplay.recording?.icon).toBeDefined();
    expect(tabFlagDisplay.recording?.label).toBe('recording');
  });

  it('is a green button that opens the recording when there is one', () => {
    const onOpen = vi.fn();
    const { container } = render(<RecordingFlag onOpen={onOpen} />);

    const button = container.querySelector('button');
    expect(button).toHaveClass('tab-flag', 'tab-flag--active', 'tab-recording');
    button?.click();

    expect(onOpen).toHaveBeenCalled();
  });

  it('is a plain inert span when there is no recording, and not a focusable dead button', () => {
    const { container } = render(<RecordingFlag />);

    expect(container.querySelector('button')).toBeNull();
    const flag = container.querySelector('.tab-recording');
    expect(flag?.tagName).toBe('SPAN');
    expect(flag).not.toHaveClass('tab-flag--active');
  });

  // A disabled button is still focusable, so a row nobody can use with would otherwise be a row the
  // keyboard walks through on its way to something else.
  it('tells assistive technology the same thing in both states', () => {
    const { container: inert } = render(<RecordingFlag />);
    const { container: live } = render(<RecordingFlag onOpen={() => {}} />);

    expect(inert.querySelector('[title]')?.getAttribute('title')).toBe('recording');
    expect(live.querySelector('[title]')?.getAttribute('title')).toBe('recording');
    expect(inert.querySelector('[aria-label]')?.getAttribute('aria-label')).toBe('recording');
    expect(live.querySelector('[aria-label]')?.getAttribute('aria-label')).toBe('recording');
  });

  it('draws nothing that can be pressed when the caller supplies no handler', () => {
    const { container } = render(<RecordingFlag onOpen={undefined} />);

    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('.tab-recording')).not.toBeNull();
  });
});