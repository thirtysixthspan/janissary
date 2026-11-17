import type { AnyOperationDescriptor } from './operation-types.js';
import { webSearchOperation } from './web-search-operation.js';

// Path-free web operations, spread into `READ_OPERATIONS`. None can express a refusal in its result,
// so none names one.
export const WEB_OPERATIONS = {
  'web-search': webSearchOperation,
} as const satisfies Record<string, AnyOperationDescriptor>;
