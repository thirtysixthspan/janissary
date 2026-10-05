import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TransportBar } from './TransportBar';
import type { Playback } from './usePlayback';

// Presentational by contract: it renders the state it is handed and reports what was pressed, and
// every action it offers also has a chord. So the cases are the two directions that matter — what the
// row shows for a given state, and which call each control makes — rather than playback itself.
function makePlayback(over: Partial<Playback> = {}): Playback {
  return {
    position: 0,
    duration: 0,
    playing: false,
    speed: 1,
    live: false,
    play: vi.fn(),
    pause: vi.fn(),
    toggle: vi.fn(),
    step: vi.fn(),
    seek: vi.fn(),
    cycleSpeed: vi.fn(),
    ...over,
  };
}

function renderBar(playback: Playback) {
  render(<TransportBar playback={playback} />);
  return playback;
}

describe('TransportBar', () => {
  it('shows a play control while stopped and a pause control while playing', () => {
    renderBar(makePlayback());

    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();

    renderBar(makePlayback({ playing: true }));

    expect(screen.getAllByRole('button', { name: 'Pause' })).toHaveLength(1);
  });

  it('toggles playback from the same button either way', async () => {
    const stopped = renderBar(makePlayback());
    await userEvent.click(screen.getAllByRole('button', { name: 'Play' })[0]);
    expect(stopped.toggle).toHaveBeenCalled();

    const playing = renderBar(makePlayback({ playing: true }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Pause' })[0]);
    expect(playing.toggle).toHaveBeenCalled();
  });

// The mock is held separately from the `Playback` it is handed as: the type widens to the plain
  // signature, so only the local still knows this is a spy and can be asked for its calls.
  it('steps backwards and forwards one frame', async () => {
    const step = vi.fn<(direction: 1 | -1) => void>();
    renderBar(makePlayback({ step }));

    await userEvent.click(screen.getByRole('button', { name: 'Previous frame' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next frame' }));

    expect(step.mock.calls).toEqual([[-1], [1]]);
  });

  it('cycles the speed one step at a time', async () => {
    const playback = renderBar(makePlayback({ speed: 2 }));

    await userEvent.click(screen.getByRole('button', { name: 'Playback speed' }));

    expect(playback.cycleSpeed).toHaveBeenCalledWith(1);
    expect(screen.getByRole('button', { name: 'Playback speed' }).textContent).toBe('2×');
  });

  it('reports the position the scrub bar was dragged to', () => {
    const playback = renderBar(makePlayback({ position: 4, duration: 10 }));

    fireEvent.change(screen.getByRole('slider', { name: 'Seek' }), { target: { value: '7' } });

    expect(playback.seek).toHaveBeenCalledWith(7);
  });

  it('renders both clocks, in m:ss until a recording runs past an hour', () => {
    const { container, unmount } = render(<TransportBar playback={makePlayback({ position: 65, duration: 125 })} />);

    expect(container.querySelector('.asciicast-clock')?.textContent).toBe('1:05 / 2:05');
    unmount();

    const long = render(<TransportBar playback={makePlayback({ position: 3725, duration: 7325 })} />);

    expect(long.container.querySelector('.asciicast-clock')?.textContent).toBe('1:02:05 / 2:02:05');
  });

  // The bar exists before the recording has told the host how long it is, so a zero duration has to
  // render as a control rather than divide by nothing.
  it('renders a zero-length recording without dividing by nothing', () => {
    expect(() => renderBar(makePlayback())).not.toThrow();
    expect(screen.getAllByRole('slider', { name: 'Seek' })[0].getAttribute('max')).toBe('0.1');
  });

  // A seek that outran the duration still renders a thumb on the bar rather than one past its end.
  it('clamps a position beyond the duration to the end of the bar', () => {
    renderBar(makePlayback({ position: 30, duration: 10 }));

    expect(screen.getAllByRole('slider', { name: 'Seek' })[0].getAttribute('value')).toBe('10');
  });
});