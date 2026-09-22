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
    intents.pull();

    expect(send).toHaveBeenNthCalledWith(1, { method: 'setDock', params: { index: 3, dock: 'left' } });
    expect(send).toHaveBeenNthCalledWith(2, { method: 'fileNavigatorSetDetail', params: { index: 3, details: 'modified' } });
    expect(send).toHaveBeenNthCalledWith(3, { method: 'fileNavigatorCollapseAll', params: { index: 3 } });
    expect(send).toHaveBeenNthCalledWith(4, { method: 'fileNavigatorPull', params: { index: 3 } });
  });

  it('sends a commit with the message and the paths it names', () => {
    const { intents, send } = setup();
    intents.commit('commit: notes.md', ['src/notes.md']);

    expect(send).toHaveBeenNthCalledWith(1, {
      method: 'fileNavigatorCommit',
      params: { index: 3, message: 'commit: notes.md', paths: ['src/notes.md'] },
    });
  });

  it('sends an empty path list for the whole-tree form', () => {
    const { intents, send } = setup();
    intents.commit('commit: 2 files', []);

    expect(send).toHaveBeenNthCalledWith(1, {
      method: 'fileNavigatorCommit', params: { index: 3, message: 'commit: 2 files', paths: [] },
    });
  });

  it('reports nothing to commit for the navigator tab it belongs to', () => {
    const { intents, send } = setup();
    intents.nothingToCommit();

    expect(send).toHaveBeenNthCalledWith(1, { method: 'fileNavigatorNothingToCommit', params: { index: 3 } });
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
