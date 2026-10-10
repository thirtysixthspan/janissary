import type { DiffFile } from './shared.js';

export function preserveContextErrors(files: DiffFile[], previous: DiffFile[]): DiffFile[] {
  return files.map((file) => {
    if (!file.contextError) return file;
    const shown = previous.find((candidate) => candidate.path === file.path) ?? file;
    const contextBoundaries = file.contextBoundaries ?? shown.contextBoundaries?.map((boundary) => boundary.expanding
      ? { ...boundary, expanding: false, error: file.contextError } : boundary);
    return {
      ...shown,
      expandingContext: false,
      canExpandContext: true,
      contextError: file.contextError,
      ...(contextBoundaries && { contextBoundaries }),
    };
  });
}
