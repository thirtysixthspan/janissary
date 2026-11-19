import type { FilePolicyFailure } from './file-read/policy.js';

export function fileFailureLine(failure: FilePolicyFailure | undefined, path: string): string | undefined {
  switch (failure) {
    case 'File not found': {
      return 'missing';
    }
    case 'Is a directory': {
      return 'notdir';
    }
    case 'Outside the workspace':
    case 'Secret file': {
      return 'forbidden';
    }
    case 'Not a text file':
    case 'File too large (>5 MB)': {
      return `${failure}: ${path}.`;
    }
    default: {
      return undefined;
    }
  }
}
