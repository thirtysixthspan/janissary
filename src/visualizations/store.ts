import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { atomicWriteFile } from '../atomic-write.js';
import { errorText } from '../error-text.js';
import type {
  ConversationModelPair,
  VisualizationChartView,
  VisualizationSummaryView,
  VisualizationTableView,
  VisualizationTurnView,
} from '../protocol.js';
import { trustWorkspace, untrustWorkspace } from '../workspace/index.js';
import { isModelPair, isRecord } from '../value-guards.js';
import { isAggregate } from './chart-spec.js';

export const VISUALIZATION_SCHEMA_VERSION = 1;

// What is on disk. Deliberately a superset of the tab window: the record also holds the refresh
// interval and the timestamps, which are the manager's business and the tab's business respectively,
// so neither has to be threaded through the other's shape.
export type VisualizationRecord = {
  schemaVersion: typeof VISUALIZATION_SCHEMA_VERSION;
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  source: string;
  pair: ConversationModelPair;
  refreshSeconds: number;
  readAt?: number;
  // Whether the user has seen the columns the parser inferred and had the chance to correct a type. The
  // interview does not start until it is true.
  reviewed: boolean;
  questions: { id: string; question: string; suggestions: string[]; answer?: string }[];
  chart?: VisualizationChartView;
  table?: VisualizationTableView;
  followUps?: string[];
  turns: VisualizationTurnView[];
  error?: string;
};

type StoreOptions = { home?: string; write?: typeof atomicWriteFile };

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isChart(value: unknown): value is VisualizationChartView {
  return isRecord(value)
    && typeof value.kind === 'string'
    && typeof value.x === 'string'
    && typeof value.y === 'string'
    && typeof value.title === 'string'
    && (value.series === undefined || typeof value.series === 'string')
    && (value.aggregate === undefined || isAggregate(value.aggregate))
    && (value.xLabel === undefined || typeof value.xLabel === 'string')
    && (value.yLabel === undefined || typeof value.yLabel === 'string');
}

function isTable(value: unknown): value is VisualizationTableView {
  return isRecord(value)
    && Array.isArray(value.columns)
    && Array.isArray(value.rows)
    && typeof value.total === 'number'
    && typeof value.truncated === 'boolean';
}

function isTurn(value: unknown): value is VisualizationTurnView {
  return isRecord(value)
    && typeof value.query === 'string'
    && typeof value.response === 'string'
    && isModelPair(value.pair)
    && (value.error === undefined || typeof value.error === 'string')
    && value.streaming === undefined;
}

function isQuestions(value: unknown): value is VisualizationRecord['questions'] {
  return Array.isArray(value) && value.every((entry) =>
    isRecord(entry)
    && typeof entry.id === 'string'
    && typeof entry.question === 'string'
    && isStringArray(entry.suggestions)
    && (entry.answer === undefined || typeof entry.answer === 'string'));
}

export function isVisualizationRecord(value: unknown): value is VisualizationRecord {
  return isRecord(value)
    && value.schemaVersion === VISUALIZATION_SCHEMA_VERSION
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.createdAt === 'number'
    && typeof value.updatedAt === 'number'
    && typeof value.source === 'string'
    && isModelPair(value.pair)
    && typeof value.refreshSeconds === 'number'
    && (value.readAt === undefined || typeof value.readAt === 'number')
    && typeof value.reviewed === 'boolean'
    && isQuestions(value.questions)
    && (value.chart === undefined || isChart(value.chart))
    && (value.table === undefined || isTable(value.table))
    && (value.followUps === undefined || isStringArray(value.followUps))
    && Array.isArray(value.turns)
    && value.turns.every((turn) => isTurn(turn))
    && (value.error === undefined || typeof value.error === 'string');
}

function assertId(id: string): void {
  if (!/^[\w-]+$/u.test(id)) throw new Error('Invalid visualization id.');
}

export const DEFAULT_VISUALIZATION_TITLE = 'New visualization';

// A record the moment it is created: no table, no questions, no chart, and no polling. Everything the
// tab can show arrives later, from a read and a model, and a visualization the user abandoned before
// either is still this — which is why a refresh of zero is the default rather than a decision made at
// the point somebody sets one.
export function freshVisualization(
  id: string,
  source: string,
  pair: ConversationModelPair,
  now: number,
): VisualizationRecord {
  return {
    schemaVersion: VISUALIZATION_SCHEMA_VERSION,
    id,
    title: DEFAULT_VISUALIZATION_TITLE,
    createdAt: now,
    updatedAt: now,
    source: source.trim(),
    pair,
    refreshSeconds: 0,
    reviewed: false,
    questions: [],
    turns: [],
  };
}

export function isCataloguedPair(pair: ConversationModelPair, catalogued: readonly ConversationModelPair[]): boolean {
  return catalogued.some(
    (candidate) => candidate.harness === pair.harness && candidate.model === pair.model,
  );
}

export class VisualizationStore {
  private readonly root: string;
  private readonly claudeJson: string;
  private readonly writeFile: typeof atomicWriteFile;
  private summaries: Map<string, VisualizationSummaryView> | undefined;
  private warned = new Set<string>();

  constructor(options: StoreOptions = {}) {
    const home = options.home ?? homedir();
    this.root = path.join(home, '.janissary', 'visualizations');
    this.claudeJson = path.join(home, '.claude.json');
    this.writeFile = options.write ?? atomicWriteFile;
  }

  list(): VisualizationSummaryView[] {
    this.summaries ??= this.scan();
    return [...this.summaries.values()].toSorted((a, b) => b.updatedAt - a.updatedAt);
  }

  read(id: string): VisualizationRecord | undefined {
    assertId(id);
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.file(id), 'utf8'));
      return isVisualizationRecord(parsed) && parsed.id === id ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  write(record: VisualizationRecord): void {
    assertId(record.id);
    mkdirSync(this.directory(record.id), { recursive: true });
    this.writeFile(this.file(record.id), `${JSON.stringify(record, null, 2)}\n`);
    this.summaries?.set(record.id, {
      id: record.id, title: record.title, updatedAt: record.updatedAt,
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
    return path.join(this.directory(id), 'visualization.json');
  }

  // A linear parse of one document per directory, memoized until something is written. That is fine
  // at the scale one user's visualizations reach, and the upgrade path if it ever is not is a
  // summary index file at the top of the tree — not needed now and deliberately not built.
  private scan(): Map<string, VisualizationSummaryView> {
    const summaries = new Map<string, VisualizationSummaryView>();
    if (!existsSync(this.root)) return summaries;
    const entries = readdirSync(this.root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const record = this.read(entry.name);
      if (record) {
        summaries.set(record.id, {
          id: record.id, title: record.title, updatedAt: record.updatedAt,
        });
      } else {
        this.warn(entry.name, 'missing or malformed visualization.json');
      }
    }
    return summaries;
  }

  private warn(id: string, message: string): void {
    if (this.warned.has(id)) return;
    this.warned.add(id);
    process.stderr.write(`warning: visualization "${id}" unavailable: ${errorText(message)}\n`);
  }
}
