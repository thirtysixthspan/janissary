import { useEffect } from 'react';

// Mirrors the project directory into the titlebar (the Chrome "app window" shows `document.title`).
// Skipped while `projectDir` is still the initial empty string, before the first state snapshot
// arrives, so the title doesn't flash `Janissary: ` before the real path is known.
export function useProjectTitle(projectDir: string): void {
  useEffect(() => {
    if (projectDir) document.title = `Janissary: ${projectDir}`;
  }, [projectDir]);
}
