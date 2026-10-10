import type { DiffFile } from './shared.js';

export function preserveContextErrors(files: DiffFile[], previous: DiffFile[]): DiffFile[] {
  return files.map((file) => {
    if (!file.contextError) return file;
    const shown = previous.find((candidate) => candidate.path === file.path) ?? file;
    return {
      ...shown,
      expandingContext: false,
      contextError: file.contextError,
    };
  });
}
