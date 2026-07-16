import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useProjectTitle } from './useProjectTitle';

describe('useProjectTitle', () => {
  it('sets document.title to Janissary (<version>): <dir> for a non-empty path', () => {
    renderHook(() => useProjectTitle('/some/project', '1.2.3'));
    expect(document.title).toBe('Janissary (1.2.3): /some/project');
  });

  it('leaves the title untouched when given an empty string', () => {
    document.title = 'unchanged';
    renderHook(() => useProjectTitle('', '1.2.3'));
    expect(document.title).toBe('unchanged');
  });

  it('updates the title again when projectDir changes across renders', () => {
    const { rerender } = renderHook(({ projectDir, version }) => useProjectTitle(projectDir, version), {
      initialProps: { projectDir: '/first/project', version: '1.2.3' },
    });
    expect(document.title).toBe('Janissary (1.2.3): /first/project');

    rerender({ projectDir: '/second/project', version: '1.2.3' });
    expect(document.title).toBe('Janissary (1.2.3): /second/project');
  });
});
