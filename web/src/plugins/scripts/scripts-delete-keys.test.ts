import { describe, expect, it } from 'vitest';
import { deleteKeyAnswer } from './scripts-delete-keys';

describe('deleteKeyAnswer', () => {
  it.each(['y', 'Y'])('confirms on %s', (key) => {
    expect(deleteKeyAnswer(key)).toBe('confirm');
  });

  it.each(['n', 'N', 'Escape'])('cancels on %s', (key) => {
    expect(deleteKeyAnswer(key)).toBe('cancel');
  });

  it('chooses the selected option on Enter', () => {
    expect(deleteKeyAnswer('Enter')).toBe('choose');
  });

  it.each(['ArrowLeft', 'ArrowRight'])('toggles the selection on %s', (key) => {
    expect(deleteKeyAnswer(key)).toBe('toggle');
  });

  it.each(['Tab', 'a', 'Delete', 'ArrowDown'])('answers nothing to %s', (key) => {
    expect(deleteKeyAnswer(key)).toBeNull();
  });
});
