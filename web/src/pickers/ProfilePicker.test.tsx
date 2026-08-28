import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import { ProfilePicker } from './ProfilePicker';
import { profilePickerRows } from './profile-picker-keys';

const profiles = profilePickerRows([
  { name: 'writing', source: 'project' },
  { name: 'coding', source: 'project' },
  { name: 'planning', source: 'janissary' },
]);

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
    const { getByText } = render(React.createElement(ProfilePicker, { profiles, selected: 1, onPick: vi.fn() }));
    expect(getByText('writing')).toBeTruthy();
    expect(getByText('coding')).toBeTruthy();
    expect(getByText('planning')).toBeTruthy();
  });

  it('renders source headers and marks only the selected profile', () => {
    const { container, getByText } = render(React.createElement(ProfilePicker, { profiles, selected: 2, onPick: vi.fn() }));
    expect(getByText('Project').classList.contains('picker-section')).toBe(true);
    expect(getByText('Janissary').classList.contains('picker-section')).toBe(true);
    const rows = container.querySelectorAll('.picker-row');
    expect(rows[0].classList.contains('selected')).toBe(false);
    expect(rows[1].classList.contains('selected')).toBe(true);
    expect(container.querySelectorAll('.picker-section')).toHaveLength(2);
  });

  it('calls onPick with the profile name when a row is clicked', () => {
    const onPick = vi.fn();
    const { container, getByText } = render(React.createElement(ProfilePicker, { profiles, selected: 1, onPick }));
    fireEvent.click(container.querySelectorAll('.picker-row')[1]);
    expect(onPick).toHaveBeenCalledWith('coding');
    fireEvent.click(getByText('Project'));
    expect(onPick).toHaveBeenCalledTimes(1);
  });
});
