import { describe, expect, it } from 'vitest';
import { commandReferenceSidebar } from '../documentation/.vitepress/command-reference.ts';

describe('commandReferenceSidebar', () => {
  it('escapes markup from help-page filenames and preserves route names', () => {
    const maliciousFilename = '<img src=x onerror="alert(1)">.md';
    const maliciousName = maliciousFilename.slice(0, -'.md'.length);
    const sidebar = commandReferenceSidebar([maliciousName, 'profile']);

    expect(sidebar.items).toEqual([
      {
        text: '<code>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</code>',
        link: `/user-documentation/command-reference/${maliciousName}`,
      },
      {
        text: '<code>profile</code>',
        link: '/user-documentation/command-reference/profile',
      },
    ]);
  });
});
