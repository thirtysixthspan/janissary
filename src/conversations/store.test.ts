import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Conversation } from './store.js';
import { CONVERSATION_SCHEMA_VERSION, ConversationStore } from './store.js';

let home: string;

function conversation(id = 'first'): Conversation {
  return {
    schemaVersion: CONVERSATION_SCHEMA_VERSION,
    id,
    title: 'First question',
    createdAt: 1,
    updatedAt: 2,
    pair: { harness: 'opencode', model: 'google/gemini' },
    turns: [{
      query: 'First question', response: 'First answer',
      pair: { harness: 'opencode', model: 'google/gemini' },
    }],
  };
}

beforeEach(() => { home = mkdtempSync(path.join(tmpdir(), 'conversations-store-')); });
afterEach(() => { rmSync(home, { recursive: true, force: true }); });

describe('ConversationStore', () => {
  it('round-trips a conversation through an atomic write', () => {
    const store = new ConversationStore({ home });
    store.write(conversation());
    expect(store.read('first')).toEqual(conversation());
  });

  it('ensures the conversation workspace, scratch directory, and trust entry', () => {
    const store = new ConversationStore({ home });
    const workspace = store.ensure('first');
    expect(existsSync(workspace)).toBe(true);
    expect(existsSync(`${workspace}.tmp`)).toBe(true);
    const config = JSON.parse(readFileSync(path.join(home, '.claude.json'), 'utf8')) as {
      projects: Record<string, { hasTrustDialogAccepted: boolean }>;
    };
    expect(config.projects[workspace]?.hasTrustDialogAccepted).toBe(true);
  });

  it('ensures an existing workspace without replacing its contents', () => {
    const store = new ConversationStore({ home });
    const workspace = store.ensure('first');
    const marker = path.join(workspace, 'marker.txt');
    writeFileSync(marker, 'kept');
    expect(store.ensure('first')).toBe(workspace);
    expect(readFileSync(marker, 'utf8')).toBe('kept');
  });

  it('skips malformed conversation directories once and ignores stray files', () => {
    const root = path.join(home, '.janissary', 'conversations');
    mkdirSync(path.join(root, 'missing'), { recursive: true });
    mkdirSync(path.join(root, 'malformed'), { recursive: true });
    writeFileSync(path.join(root, 'malformed', 'conversation.json'), '{broken');
    writeFileSync(path.join(root, 'stray.txt'), 'ignored');
    const warning = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const store = new ConversationStore({ home });

    expect(store.list()).toEqual([]);
    expect(store.list()).toEqual([]);
    expect(warning).toHaveBeenCalledTimes(2);
    expect(existsSync(path.join(root, 'missing'))).toBe(true);
    expect(existsSync(path.join(root, 'malformed'))).toBe(true);
    warning.mockRestore();
  });

  it('deletes one conversation with its workspace and trust entry', () => {
    const store = new ConversationStore({ home });
    const first = store.ensure('first');
    const second = store.ensure('second');
    writeFileSync(path.join(first, 'marker.txt'), 'remove');
    writeFileSync(path.join(second, 'marker.txt'), 'keep');
    store.write(conversation('first'));
    store.write(conversation('second'));

    store.delete('first');

    expect(existsSync(store.directory('first'))).toBe(false);
    expect(readFileSync(path.join(second, 'marker.txt'), 'utf8')).toBe('keep');
    const config = JSON.parse(readFileSync(path.join(home, '.claude.json'), 'utf8')) as {
      projects: Record<string, unknown>;
    };
    expect(config.projects).not.toHaveProperty(first);
    expect(config.projects).toHaveProperty(second);
  });

  it('leaves the previous document intact when a write fails', () => {
    const working = new ConversationStore({ home });
    working.write(conversation());
    const original = readFileSync(
      path.join(working.directory('first'), 'conversation.json'), 'utf8',
    );
    const failing = new ConversationStore({
      home,
      write: () => { throw new Error('disk full'); },
    });

    expect(() => failing.write({ ...conversation(), title: 'replacement' })).toThrow('disk full');
    expect(readFileSync(
      path.join(working.directory('first'), 'conversation.json'), 'utf8',
    )).toBe(original);
  });

  it('survives a new store instance with its turns and workspace contents', () => {
    const first = new ConversationStore({ home });
    const workspace = first.ensure('first');
    writeFileSync(path.join(workspace, 'marker.txt'), 'survived');
    first.write(conversation());

    const restarted = new ConversationStore({ home });

    expect(restarted.list()).toEqual([{ id: 'first', title: 'First question', updatedAt: 2 }]);
    expect(restarted.read('first')?.turns).toHaveLength(1);
    expect(readFileSync(path.join(restarted.directory('first'), 'workspace', 'marker.txt'), 'utf8'))
      .toBe('survived');
  });
});
