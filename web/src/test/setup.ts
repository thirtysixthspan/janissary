import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

// Tells React it's running under a test runner so state updates wrapped in act()
// are recognized; without it React warns "environment is not configured to support act(...)".
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// jsdom has no canvas implementation; its getContext() logs a "Not implemented" warning on every
// call from code that measures text or captures frames. Returning null keeps the existing
// "canvas unavailable" fallback without pulling in the native canvas package.
HTMLCanvasElement.prototype.getContext = () => null;

afterEach(cleanup);
