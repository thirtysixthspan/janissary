import { useEffect } from 'react';

// Mirrors the project directory and app version into the titlebar (the Chrome "app window" shows
// `document.title`). Skipped while `projectDir` is still the initial empty string, before the
// first state snapshot arrives, so the title doesn't flash `Janissary (): ` before the real path
// and version are known.
export function useProjectTitle(projectDir: string, version: string): void {
  useEffect(() => {
    if (projectDir) document.title = `Janissary (${version}): ${projectDir}`;
  }, [projectDir, version]);
}
