import { describe, expect, it } from 'vitest';
import { isModalOpen, openModal } from './modal-open';

describe('modal-open', () => {
  it('reports closed when nothing is open', () => {
    expect(isModalOpen()).toBe(false);
  });

  it('stays open until every opener has released', () => {
    const releaseFirst = openModal();
    const releaseSecond = openModal();
    expect(isModalOpen()).toBe(true);

    releaseFirst();
    expect(isModalOpen()).toBe(true);

    releaseSecond();
    expect(isModalOpen()).toBe(false);
  });

  it('ignores a second release of the same handle so another open modal stays open', () => {
    const releaseFirst = openModal();
    const releaseSecond = openModal();

    releaseFirst();
    releaseFirst();
    expect(isModalOpen()).toBe(true);

    releaseSecond();
    expect(isModalOpen()).toBe(false);
  });
});
