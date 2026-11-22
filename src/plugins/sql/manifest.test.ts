import { describe, expect, it } from 'vitest';
import { sqlManifest } from './manifest.js';

describe('sql tab plugin manifest', () => {
  it('claims the sql command and no file extensions, and never docks', () => {
    expect(sqlManifest.command).toBe('sql');
    expect(sqlManifest.fileExtensions).toEqual({});
    expect(sqlManifest.capabilities).not.toContain('dockTab');
  });

  it('asks for the project file list capability to resolve relative file paths', () => {
    expect(sqlManifest.capabilities).toContain('projectFileList');
  });
});
