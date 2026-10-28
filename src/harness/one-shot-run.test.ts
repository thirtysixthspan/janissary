import { describe, expect, it } from 'vitest';
import { oneShotRunEntry } from './one-shot-run.js';

describe('oneShotRunEntry', () => {
  it('builds an entry that fires once, immediately', () => {
    const built = oneShotRunEntry('run-1', 'npm run lint');
    expect(built).toMatchObject({ id: 'run-1', command: 'npm run lint', spec: 'once', recurring: false });
    expect(built.nextRun).toBeLessThanOrEqual(Date.now());
  });
});
