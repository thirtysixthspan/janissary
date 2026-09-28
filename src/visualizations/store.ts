import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { atomicWriteFile } from '../atomic-write.js';
import { errorText } from '../error-text.js';
import type {
  ConversationModelPair,
  VisualizationChartRecord,
  VisualizationDatasetView,
  VisualizationSummaryView,
  VisualizationTurnView,
} from '../protocol.js';
import { trustWorkspace, untrustWorkspace } from '../workspace/index.js';
import { isModelPair, isRecord } from '../value-guards.js';
import { isChartList, isDatasetList } from './chart-record.js';

// Version 2 is the first version this feature ever shipped as, and the one this change introduces: a
// visualization holds a list of charts rather than one, and the questions and the column review are
// gone. A version-1 document is not migrated — the feature has never been in a release, so there is
// nobody's saved work to lose, and a migration would be a second shape to keep true for no user. The
// scan below reports one the way it reports a malformed document.
export const VISUALIZATION_SCHEMA_VERSION = 2;

// What is on disk. Deliberately a superset of the tab window: the record also holds the datasets' raw
// tables and their documents, which the model is shown and the client never sees, so neither side has
// to be threaded through the other's shape.
export type VisualizationRecord = {
  schemaVersion: typeof VISUALIZATION_SCHEMA_VERSION;
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  // The most recent address the user named, empty until they name one. A visualization with no source
  // is a conversation waiting for its first message, not a broken record.
  source: string;
  pair: ConversationModelPair;
  datasets: VisualizationDatasetView[];
  charts: VisualizationChartRecord[];
  turns: VisualizationTurnView[];
  followUps?: string[];
  error?: string;
};

type StoreOptions = { home?: string; write?: typeof atomicWriteFile };

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

// A stored turn may be marked streaming, because a turn is persisted before the model is called and a
// process that exits mid-reply leaves that flag on disk — refusing it would make the whole record
// unreadable, and therefore delete the visualization, at exactly the moment a crash would. The window
// guard in the plugin's shared contract accepts the same flag, because a payload carries one too: the
// tab cannot disable its composer or offer a cancel without it.
function isTurn(value: unknown): value is VisualizationTurnView {
  return isRecord(value)
    && typeof value.query === 'string'
    && typeof value.response === 'string'
    && isModelPair(value.pair)
    && (value.streaming === undefined || typeof value.streaming === 'boolean');
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
    && isDatasetList(value.datasets)
    && isChartList(value.charts)
    && Array.isArray(value.turns)
    && value.turns.every(isTurn)
    && (value.followUps === undefined || isStringArray(value.followUps))
    && (value.error === undefined || typeof value.error === 'string');
}

function assertId(id: string): void {
  if (!/^[\w-]+$/u.test(id)) throw new Error('Invalid visualization id.');
}

export const DEFAULT_VISUALIZATION_TITLE = 'New visualization';

// A record the moment it is created: no source, no data, no charts, and no polling. Everything the
// tab can show arrives later, from a read and a conversation, and a visualization the user abandoned
// before either is still this — which is why a refresh of zero is the default rather than a decision
// made at the point somebody sets one.
export function freshVisualization(
  id: string,
  pair: ConversationModelPair,
  now: number,
): VisualizationRecord {
  return {
    schemaVersion: VISUALIZATION_SCHEMA_VERSION,
    id,
    title: DEFAULT_VISUALIZATION_TITLE,
    createdAt: now,
    updatedAt: now,
    source: '',
    pair,
    datasets: [],
    charts: [],
    turns: [],
  };
}

export function isCataloguedPair(pair: ConversationModelPair, catalogued: readonly ConversationModelPair[]): boolean {
  return catalogued.some(
    (candidate) => candidate.harness === pair.harness && candidate.model === pair.model,
  );
}

// A visualization with no source, no charts and nothing said is a conversation nobody has started. It is
// kept in memory so its tab can be open and empty, and it is neither written to disk nor listed in the
// index — which is the property the previous design got by not creating a record until the first read,
// and which a chat-only tab has to keep some other way.
export function isEmptyRecord(record: VisualizationRecord): boolean {
  return record.source === '' && record.charts.length === 0 && record.turns.length === 0;
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

  // The empty workspace this record's agent is confined to, and the one directory a file it acquired
  // may be read from. Created on first use rather than at creation, so a visualization nobody ever
  // asked anything of leaves nothing on disk.
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
