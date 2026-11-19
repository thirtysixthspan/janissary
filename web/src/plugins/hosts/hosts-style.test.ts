import { describe, expect, it } from 'vitest';
import hosts from './hosts.css?raw';

describe('hosts stylesheet', () => {
  it('keeps headings and rows on one grid with a track wide enough for both buttons', () => {
    const columns = hosts.match(/\.host-columns, \.host-row \{[^}]+\}/)?.[0];

    expect(columns).toBeDefined();
    expect(columns).toContain('display: grid');
    expect(columns).toContain(
      'grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.5fr) minmax(0, 1.5fr) 4em;',
    );
    expect(columns).toContain('font-size: 12px');
    expect(columns).toContain('text-align: left');
  });

  it('scopes the ellipsis to the text cells so the actions cell is not clipped', () => {
    expect(hosts).toContain(
      '.host-row-name, .host-row-user, .host-row-destination, .host-row-path { overflow: hidden; text-overflow: ellipsis; }',
    );
    expect(hosts).not.toContain('.host-row > span');
    expect(hosts).not.toMatch(/\.host-row-actions[^{]*\{[^}]*overflow:\s*hidden/);
  });

  it('keeps the action buttons side by side and non-shrinking', () => {
    const actions = hosts.match(/\.host-row-actions \{[^}]+\}/)?.[0];

    expect(actions).toContain('display: flex');
    expect(actions).toContain('gap: 2px');
    expect(actions).toContain('flex-shrink: 0');
  });
});
