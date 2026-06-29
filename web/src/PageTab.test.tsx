import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import type { PageView } from '@shared/protocol';
import { PageTab } from './PageTab';

function makePage(overrides: Partial<PageView> = {}): PageView {
  return {
    url: 'https://slashdot.org/',
    domain: 'slashdot.org',
    number: 1,
    ...overrides,
  };
}

describe('PageTab', () => {
  it('renders an iframe with the page URL as src', () => {
    const page = makePage({ url: 'https://slashdot.org/' });
    const { container } = render(<PageTab page={page} />);
    const iframe = container.querySelector('iframe');
    expect(iframe).toBeInTheDocument();
    expect(iframe?.src).toBe('https://slashdot.org/');
  });

  it('sets the iframe title to number) domain', () => {
    const page = makePage({ number: 2, domain: 'example.com', url: 'https://example.com/' });
    const { container } = render(<PageTab page={page} />);
    expect(container.querySelector('iframe')?.title).toBe('2) example.com');
  });
});
