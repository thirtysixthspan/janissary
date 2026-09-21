import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ConnectionPlug, type ConnectionPlugState } from './ConnectionPlug';

describe('ConnectionPlug', () => {
  // The colour is the stylesheet's, keyed off this attribute, so what the component owes is the
  // state on the element and a word for it — see connection-plug-style.test.ts for the palette.
  it.each<[ConnectionPlugState, string]>([
    ['provisioning', 'Provisioning'],
    ['active', 'Connected'],
    ['reconnecting', 'Reconnecting'],
    ['detached', 'Detached'],
    ['ended', 'Closed'],
  ])('carries %s on the element and names it', (state, label) => {
    const { container } = render(<ConnectionPlug state={state} />);
    const plug = container.querySelector('.connection-plug');

    expect(plug).toHaveAttribute('data-state', state);
    expect(plug).toHaveAttribute('aria-label', label);
    expect(plug).toHaveAttribute('title', label);
  });

  it('reads as an image rather than as something pressable', () => {
    const { container } = render(<ConnectionPlug state="active" />);
    expect(container.querySelector('.connection-plug')).toHaveAttribute('role', 'img');
    expect(container.querySelector('button')).toBeNull();
  });
});
