import type { Tab, ImageView, PluginTabRuntime, MarkdownView, EditorView, PageView, FileNavigatorView } from './types.js';
import type { Managers } from '../managers.js';
import { TabQueueState } from './queue-state.js';
import * as tabOpeners from './openers.js';

export abstract class TabOpeningState extends TabQueueState {
  abstract tabs: Tab[];
  abstract activeTab: number;
  abstract setActiveTab(index: number): void;
  abstract applyOpenResult(result: { tabs: Tab[]; activeTab: number }): void;

  protected constructor(protected managers: Managers) {
    super();
  }

  openImageTab(image: ImageView): void {
    tabOpeners.openImageTab(this, image);
  }

  focusPluginTab(pluginId: string, instanceKey: string): string | undefined {
    return tabOpeners.focusPluginTab(this, pluginId, instanceKey);
  }

  openPluginTab(labelPrefix: string, title: string, plugin: PluginTabRuntime): string {
    return tabOpeners.openPluginTab(this, labelPrefix, title, plugin);
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
