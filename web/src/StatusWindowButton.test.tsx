import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { faPlug } from '@fortawesome/free-solid-svg-icons';
import { StatusWindowButton } from './StatusWindowButton';

describe('StatusWindowButton', () => {
  it('renders enabled with the active title when it has content', () => {
    const { getByTitle } = render(
      <StatusWindowButton
        icon={faPlug} className="tab-connections" hasContent activeTitle="connections" emptyTitle="no active connections"
        onEnter={() => {}} onLeave={() => {}} onClick={() => {}}
      />,
    );
    const button = getByTitle('connections');
    expect(button).not.toBeDisabled();
    expect(button.className).toBe('tab-connections');
  });

  it('renders disabled with the empty title and the empty modifier class when it has no content', () => {
    const { getByTitle } = render(
      <StatusWindowButton
        icon={faPlug} className="tab-connections" hasContent={false} activeTitle="connections" emptyTitle="no active connections"
        onEnter={() => {}} onLeave={() => {}} onClick={() => {}}
      />,
    );
    const button = getByTitle('no active connections');
    expect(button).toBeDisabled();
    expect(button.className).toBe('tab-connections status-window-button-empty');
  });

  it('fires onClick only when it has content', () => {
    const onClick = vi.fn();
    const { getByTitle } = render(
      <StatusWindowButton
        icon={faPlug} className="tab-connections" hasContent activeTitle="connections" emptyTitle="no active connections"
        onEnter={() => {}} onLeave={() => {}} onClick={onClick}
      />,
    );
    getByTitle('connections').click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
