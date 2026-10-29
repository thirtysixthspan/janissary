import path from 'node:path';
import { createLogger, loadConfigFromFile } from 'vite';
import { describe, expect, it, vi } from 'vitest';

const CONFIG_FILE = path.resolve('web/vite.config.ts');

async function loadNatively() {
  const logger = createLogger('silent');
  const warn = vi.spyOn(logger, 'warn');
  const loaded = await loadConfigFromFile(
    { command: 'build', mode: 'production' }, CONFIG_FILE, undefined, 'silent', logger, 'native',
  );
  return { loaded, warnings: warn.mock.calls.map(([message]) => message) };
}

describe('web vite config', () => {
  it('loads with the native config loader without unsupported-feature warnings', async () => {
    const { warnings } = await loadNatively();
    expect(warnings).toEqual([]);
  });

  it('roots the build at the web directory', async () => {
    const { loaded } = await loadNatively();
    expect(loaded?.config.root).toBe(path.resolve('web'));
  });
});
