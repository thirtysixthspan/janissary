import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import { ProfilePicker } from './ProfilePicker';

describe('ProfilePicker', () => {
  it('renders the profiles title', () => {
    const { getByText } = render(React.createElement(ProfilePicker, { profiles: [], selected: 0, onPick: vi.fn() }));
    expect(getByText('profiles')).toBeTruthy();
  });

  it('shows no-profiles message when profiles is empty', () => {
    const { getByText } = render(React.createElement(ProfilePicker, { profiles: [], selected: 0, onPick: vi.fn() }));
    expect(getByText('(no profiles)')).toBeTruthy();
  });

  it('renders all profile names', () => {
    const { getByText } = render(React.createElement(ProfilePicker, { profiles: ['writing', 'coding'], selected: 0, onPick: vi.fn() }));
    expect(getByText('writing')).toBeTruthy();
    expect(getByText('coding')).toBeTruthy();
  });

  it('marks the selected profile with the selected class', () => {
    const { container } = render(React.createElement(ProfilePicker, { profiles: ['writing', 'coding'], selected: 1, onPick: vi.fn() }));
    const rows = container.querySelectorAll('.picker-row');
    expect(rows[0].classList.contains('selected')).toBe(false);
    expect(rows[1].classList.contains('selected')).toBe(true);
  });

  it('calls onPick with the profile name when a row is clicked', () => {
    const onPick = vi.fn();
    const { container } = render(React.createElement(ProfilePicker, { profiles: ['writing', 'coding'], selected: 0, onPick }));
    fireEvent.click(container.querySelectorAll('.picker-row')[1]);
    expect(onPick).toHaveBeenCalledWith('coding');
  });
});
