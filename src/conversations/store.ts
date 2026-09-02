import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { atomicWriteFile } from '../atomic-write.js';
import { errorText } from '../error-text.js';
import type {
  ConversationModelPair,
  ConversationSummaryView,
  ConversationTurnView,
} from '../protocol.js';
import { trustWorkspace, untrustWorkspace } from '../workspace/index.js';

export const CONVERSATION_SCHEMA_VERSION = 1;

export type Conversation = {
  schemaVersion: typeof CONVERSATION_SCHEMA_VERSION;
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  pair: ConversationModelPair;
  turns: ConversationTurnView[];
};

type StoreOptions = {
  home?: string;
  write?: typeof atomicWriteFile;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPair(value: unknown): value is ConversationModelPair {
  return isRecord(value)
    && (value.harness === 'claude' || value.harness === 'opencode')
    && typeof value.model === 'string';
}

function isTurn(value: unknown): value is ConversationTurnView {
  return isRecord(value)
    && typeof value.query === 'string'
    && typeof value.response === 'string'
    && isPair(value.pair)
    && (value.error === undefined || typeof value.error === 'string')
    && value.streaming === undefined;
}

function isConversation(value: unknown): value is Conversation {
  return isRecord(value)
    && value.schemaVersion === CONVERSATION_SCHEMA_VERSION
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.createdAt === 'number'
    && typeof value.updatedAt === 'number'
    && isPair(value.pair)
    && Array.isArray(value.turns)
    && value.turns.every((turn) => isTurn(turn));
}

function assertId(id: string): void {
  if (!/^[\w-]+$/u.test(id)) throw new Error('Invalid conversation id.');
}

export class ConversationStore {
  private readonly root: string;
  private readonly claudeJson: string;
  private readonly writeFile: typeof atomicWriteFile;
  private summaries: Map<string, ConversationSummaryView> | undefined;
  private warned = new Set<string>();

  constructor(options: StoreOptions = {}) {
    const home = options.home ?? homedir();
    this.root = path.join(home, '.janissary', 'conversations');
    this.claudeJson = path.join(home, '.claude.json');
    this.writeFile = options.write ?? atomicWriteFile;
  }

  list(): ConversationSummaryView[] {
    this.summaries ??= this.scan();
    return [...this.summaries.values()].toSorted((a, b) => b.updatedAt - a.updatedAt);
  }

  read(id: string): Conversation | undefined {
    assertId(id);
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.file(id), 'utf8'));
      return isConversation(parsed) && parsed.id === id ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  write(conversation: Conversation): void {
    assertId(conversation.id);
    mkdirSync(this.directory(conversation.id), { recursive: true });
    this.writeFile(this.file(conversation.id), `${JSON.stringify(conversation, null, 2)}\n`);
    this.summaries?.set(conversation.id, {
      id: conversation.id,
      title: conversation.title,
      updatedAt: conversation.updatedAt,
    });
  }

  ensure(id: string): string {
    assertId(id);
    const workspace = path.join(this.directory(id), 'workspace');
    mkdirSync(workspace, { recursive: true });
    mkdirSync(`${workspace}.tmp`, { recursive: true });
    trustWorkspace(workspace, this.claudeJson);
    return workspace;
  }

  delete(id: string): void {
    assertId(id);
    const workspace = path.join(this.directory(id), 'workspace');
    untrustWorkspace(workspace, this.claudeJson);
    rmSync(this.directory(id), { recursive: true, force: true });
    this.summaries?.delete(id);
  }

  directory(id: string): string {
    assertId(id);
    return path.join(this.root, id);
  }

  private file(id: string): string {
    return path.join(this.directory(id), 'conversation.json');
  }

  private scan(): Map<string, ConversationSummaryView> {
    const summaries = new Map<string, ConversationSummaryView>();
    if (!existsSync(this.root)) return summaries;
    const entries = readdirSync(this.root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const conversation = this.read(entry.name);
      if (conversation) {
        summaries.set(conversation.id, {
          id: conversation.id, title: conversation.title, updatedAt: conversation.updatedAt,
        });
      } else {
        this.warn(entry.name, 'missing or malformed conversation.json');
      }
    }
    return summaries;
  }

  private warn(id: string, message: string): void {
    if (this.warned.has(id)) return;
    this.warned.add(id);
    process.stderr.write(`warning: conversation "${id}" unavailable: ${errorText(message)}\n`);
  }
}
