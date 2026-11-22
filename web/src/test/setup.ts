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

// jsdom has no media pipeline either; play() logs a "Not implemented" warning on every mount of a
// video or audio view. A resolved promise keeps that warning out of test output while preserving the
// defensive .catch() path callers attach to the result.
HTMLMediaElement.prototype.play = () => Promise.resolve();

afterEach(cleanup);
