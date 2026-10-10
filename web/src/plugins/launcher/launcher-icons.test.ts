import { describe, expect, it } from 'vitest';
import { isLauncherIcon, launchIcon, LAUNCHER_FALLBACK_ICON } from './launcher-icons';

describe('launcher icon names', () => {
  it('recognizes the database icon used by the built-in SQL command', () => {
    expect(launchIcon('faDatabase')).toMatchObject({ icon: expect.any(Object), known: true });
    expect(isLauncherIcon('faDatabase')).toBe(true);
  });

  it.each(['__proto__', 'constructor', 'toString'])('uses the fallback for unknown name %s', (name) => {
    expect(launchIcon(name)).toEqual({ icon: LAUNCHER_FALLBACK_ICON, known: false });
    expect(isLauncherIcon(name)).toBe(false);
  });
});
