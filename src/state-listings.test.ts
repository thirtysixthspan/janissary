import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { TaskRow } from './tab/types.js';
import type { ProfileRow } from './profile/types.js';
import type * as StateListings from './state-listings.js';

const listTasks = vi.fn<(projectDir: string) => TaskRow[]>();
const listProfileRows = vi.fn<() => ProfileRow[]>();

vi.mock('./tasks.js', () => ({ listTasks: (projectDir: string) => listTasks(projectDir) }));
vi.mock('./profiles.js', () => ({ listProfileRows: () => listProfileRows() }));

let listings: typeof StateListings;

function task(name: string): TaskRow {
  return { path: name, name, depth: 0, dir: false, source: 'project' };
}

beforeEach(async () => {
  vi.resetModules();
  listTasks.mockReset();
  listProfileRows.mockReset();
  listings = await import('./state-listings.js');
});

describe('cachedTasks', () => {
  it('walks once for repeated calls inside the interval and returns the same rows', () => {
    listTasks.mockReturnValue([task('a.md')]);
    const first = listings.cachedTasks('/p', () => 10_000);
    const second = listings.cachedTasks('/p', () => 10_000 + listings.LISTING_TTL_MS - 1);
    expect(listTasks).toHaveBeenCalledTimes(1);
    expect(listTasks).toHaveBeenCalledWith('/p');
    expect(second).toBe(first);
  });

  it('walks again once the interval has elapsed and returns the new rows', () => {
    listTasks.mockReturnValueOnce([task('a.md')]).mockReturnValueOnce([task('b.md')]);
    listings.cachedTasks('/p', () => 10_000);
    const later = listings.cachedTasks('/p', () => 10_000 + listings.LISTING_TTL_MS);
    expect(listTasks).toHaveBeenCalledTimes(2);
    expect(later).toEqual([task('b.md')]);
  });

  it('walks again immediately when the project directory changes', () => {
    listTasks.mockReturnValue([]);
    listings.cachedTasks('/p', () => 10_000);
    listings.cachedTasks('/q', () => 10_000);
    expect(listTasks.mock.calls).toEqual([['/p'], ['/q']]);
  });

  it('walks again when the clock moves backwards', () => {
    listTasks.mockReturnValue([]);
    listings.cachedTasks('/p', () => 10_000);
    listings.cachedTasks('/p', () => 9000);
    expect(listTasks).toHaveBeenCalledTimes(2);
  });
});

describe('cachedProfileRows', () => {
  it('walks once inside the interval and again after it', () => {
    listProfileRows.mockReturnValueOnce([{ name: 'code', source: 'project' }])
      .mockReturnValueOnce([{ name: 'web', source: 'janissary' }]);
    const first = listings.cachedProfileRows(() => 10_000);
    expect(listings.cachedProfileRows(() => 10_500)).toBe(first);
    expect(listProfileRows).toHaveBeenCalledTimes(1);
    expect(listings.cachedProfileRows(() => 11_000)).toEqual([{ name: 'web', source: 'janissary' }]);
    expect(listProfileRows).toHaveBeenCalledTimes(2);
  });
});
