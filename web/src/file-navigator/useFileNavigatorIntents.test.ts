import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { JanusClient } from '../ws';
import { useFileNavigatorIntents } from './useFileNavigatorIntents';

function setup() {
  const send = vi.fn();
  const client = { send } as unknown as JanusClient;
  const { result } = renderHook(() => useFileNavigatorIntents(client, 3));
  return { intents: result.current, send };
}

describe('useFileNavigatorIntents', () => {
  it('adapts tree navigation actions to indexed protocol messages', () => {
    const { intents, send } = setup();
    intents.toggle('src');
    intents.reroot();
    intents.rerootTo('packages/app');

    expect(send).toHaveBeenNthCalledWith(1, { method: 'fileNavigatorToggle', params: { index: 3, path: 'src' } });
    expect(send).toHaveBeenNthCalledWith(2, { method: 'fileNavigatorReroot', params: { index: 3 } });
    expect(send).toHaveBeenNthCalledWith(3, { method: 'fileNavigatorReroot', params: { index: 3, path: 'packages/app' } });
  });

  it('adapts header actions to indexed protocol messages', () => {
    const { intents, send } = setup();
    intents.setDock('left');
    intents.setDetail('modified');
    intents.collapseAll();

    expect(send).toHaveBeenNthCalledWith(1, { method: 'setDock', params: { index: 3, dock: 'left' } });
    expect(send).toHaveBeenNthCalledWith(2, { method: 'fileNavigatorSetDetail', params: { index: 3, details: 'modified' } });
    expect(send).toHaveBeenNthCalledWith(3, { method: 'fileNavigatorCollapseAll', params: { index: 3 } });
  });

  it('adapts command and GitHub actions to command messages', () => {
    const { intents, send } = setup();
    intents.sendCommand('edit /project/readme.md');
    intents.openGithub('https://github.com/owner/repo/commits/main/');

    expect(send).toHaveBeenNthCalledWith(1, { method: 'command', params: { text: 'edit /project/readme.md' } });
    expect(send).toHaveBeenNthCalledWith(2, {
      method: 'command', params: { text: 'open https://github.com/owner/repo/commits/main/' },
    });
  });
});
