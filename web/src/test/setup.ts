import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

// Tells React it's running under a test runner so state updates wrapped in act()
// are recognized; without it React warns "environment is not configured to support act(...)".
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterEach(cleanup);
