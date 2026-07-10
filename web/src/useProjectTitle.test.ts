import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useProjectTitle } from './useProjectTitle';

describe('useProjectTitle', () => {
  it('sets document.title to Janissary: <dir> for a non-empty path', () => {
    renderHook(() => useProjectTitle('/some/project'));
    expect(document.title).toBe('Janissary: /some/project');
  });

  it('leaves the title untouched when given an empty string', () => {
    document.title = 'unchanged';
    renderHook(() => useProjectTitle(''));
    expect(document.title).toBe('unchanged');
  });

  it('updates the title again when projectDir changes across renders', () => {
    const { rerender } = renderHook(({ projectDir }) => useProjectTitle(projectDir), {
      initialProps: { projectDir: '/first/project' },
    });
    expect(document.title).toBe('Janissary: /first/project');

    rerender({ projectDir: '/second/project' });
    expect(document.title).toBe('Janissary: /second/project');
  });
});
