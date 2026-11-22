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
});
