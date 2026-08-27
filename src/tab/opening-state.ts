import type { Tab, EditorView, FileNavigatorView } from './types.js';
import type { TabPluginPayload, TabPluginResources, TabPluginTabUpdate } from '../plugins/api.js';
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


  updatePluginTab(
    pluginId: string, instanceKey: string,
    factory: (resources: TabPluginResources) => TabPluginTabUpdate,
  ): void {
    tabOpeners.updatePluginTab(this, pluginId, instanceKey, factory);
  }

  openEditorTab(view: EditorView): string {
    return tabOpeners.openEditorTab(this, view, (label, path) => this.managers.editorWatch.watch(label, path));
  }

  openFilesTab(view: FileNavigatorView): void {
    tabOpeners.openFilesTab(this, view);
  }

  openNotificationsTab(): void {
    tabOpeners.openNotificationsTab(this);
  }
}
