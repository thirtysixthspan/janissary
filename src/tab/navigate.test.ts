import { describe, expect, it } from 'vitest';
import { navigatePageTab } from './navigate.js';
import { makePageTab } from './index.js';

describe('navigatePageTab', () => {
  it('updates url, domain, and title for a valid address', () => {
    const tab = makePageTab('page-1', '#fff', 1, 1, '#fff', { url: 'https://old.com/', domain: 'old.com', number: 1 });
    expect(navigatePageTab(tab, 'new.com/path')).toBe(true);
    expect(tab.page).toEqual({ url: 'https://new.com/path', domain: 'new.com', number: 1 });
    expect(tab.title).toBe('new.com');
  });

  it('rejects an invalid scheme and leaves the tab unchanged', () => {
    const tab = makePageTab('page-1', '#fff', 1, 1, '#fff', { url: 'https://old.com/', domain: 'old.com', number: 1 });
    expect(navigatePageTab(tab, 'javascript:alert(1)')).toBe(false);
    expect(tab.page?.url).toBe('https://old.com/');
  });

  it('is a no-op for a non-page tab', () => {
    const tab = makePageTab('page-1', '#fff', 1, 1, '#fff', { url: 'https://old.com/', domain: 'old.com', number: 1 });
    delete tab.page;
    expect(navigatePageTab(tab, 'new.com')).toBe(false);
  });
});
