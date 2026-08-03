import type { Tab, MarkdownView, EditorView, PageView, FileNavigatorView } from './types.js';
import type { TabPluginPayload, TabPluginResources } from '../plugins/api.js';
import type { Managers } from '../managers.js';
import { TabQueueState } from './queue-state.js';
import * as tabOpeners from './openers.js';

export abstract class TabOpeningState extends TabQueueState {
  abstract tabs: Tab[];
  abstract activeTab: number;
  abstract setActiveTab(index: number): void;
  abstract applyOpenResult(result: { tabs: Tab[]; activeTab: number }): void;
  abstract registerFile(path: string): string;
  abstract get openFiles(): Map<string, string>;

  protected constructor(protected managers: Managers) {
    super();
  }

  openPluginTab(
    pluginId: string, labelPrefix: string, instanceKey: string, schemaVersion: number,
    sourceLabel: string, factory: (resources: TabPluginResources) => TabPluginPayload,
  ): void {
    tabOpeners.openPluginTab(
      this, pluginId, labelPrefix, instanceKey, schemaVersion, sourceLabel, factory,
    );
  }

  openMarkdownTab(view: MarkdownView): void {
    tabOpeners.openMarkdownTab(this, view);
  }

  openEditorTab(view: EditorView): void {
    tabOpeners.openEditorTab(this, view, (label, path) => this.managers.editorWatch.watch(label, path));
  }

  openPageTab(view: Pick<PageView, 'url' | 'domain'>): void {
    tabOpeners.openPageTab(this, view);
  }

  openFilesTab(view: FileNavigatorView): void {
    tabOpeners.openFilesTab(this, view);
  }

  openNotificationsTab(): void {
    tabOpeners.openNotificationsTab(this);
  }

  openSchedulesTab(): void {
    tabOpeners.openSchedulesTab(this);
  }
}
