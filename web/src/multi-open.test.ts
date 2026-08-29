import { describe, expect, it } from 'vitest';
import { imageManifest } from '@shared/plugins/image/manifest';
import { multiOpenablePaths } from './multi-open';

describe('multiOpenablePaths', () => {
  it('fans out over every selected path when all of them qualify', () => {
    expect(multiOpenablePaths(['first.png', 'second.jpg'])).toEqual(['first.png', 'second.jpg']);
  });

  it('matches extensions case-insensitively', () => {
    expect(multiOpenablePaths(['COVER.PNG', 'Thumb.JPG'])).toEqual(['COVER.PNG', 'Thumb.JPG']);
  });

  it('returns null for a single qualifying path', () => {
    expect(multiOpenablePaths(['photo.png'])).toBeNull();
  });

  it('returns null for a mixed selection', () => {
    expect(multiOpenablePaths(['photo.png', 'notes.txt'])).toBeNull();
  });

  it('returns null for an empty selection', () => {
    expect(multiOpenablePaths([])).toBeNull();
  });

  // The host-owned literal exists because the entry bundle may not import the plugin's contract —
  // a test can, and this one keeps the two from drifting apart silently (see `registry.test.tsx`).
  it('fans out for exactly the extensions the image manifest declares', () => {
    const extensions = Object.keys(imageManifest.fileExtensions);
    expect(extensions.length).toBeGreaterThan(0);
    for (const extension of extensions) {
      expect(multiOpenablePaths([`a${extension}`, `b${extension}`]))
        .toEqual([`a${extension}`, `b${extension}`]);
    }
    expect(multiOpenablePaths(['a.md', 'b.md'])).toBeNull();
    expect(multiOpenablePaths(['a.txt', 'b.txt'])).toBeNull();
  });
});
