import { describe, expect, it, vi } from 'vitest';

describe('client test setup', () => {
  it('canvas getContext is stubbed to return null', () => {
    expect(document.createElement('canvas').getContext('2d')).toBeNull();
  });

  it('stubs media play() to resolve without an unimplemented warning', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const media = document.createElement('video');
      await expect(media.play()).resolves.toBeUndefined();
      expect(error).not.toHaveBeenCalledWith(expect.stringContaining("HTMLMediaElement's play"));
    } finally {
      error.mockRestore();
    }
  });

  it('stubs canvas toDataURL() to return a data URL without an unimplemented warning', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const canvas = document.createElement('canvas');
      expect(canvas.toDataURL('image/png')).toBe('data:image/png;base64,');
      expect(error).not.toHaveBeenCalledWith(expect.stringContaining("HTMLCanvasElement's toDataURL"));
    } finally {
      error.mockRestore();
    }
  });
});
